"""Build the optimised regolith-plant asset for the lunar outpost.

Source: E:/UE/UmodelExport/EnvironmentGLB/regolith/StaticMesh (UE glTF exports,
one node + one mesh per file, ~12.7k triangles in total but 14.5 MB of PNG).

What this does
  1. keeps only the parts that make up the assembled plant,
  2. re-encodes every texture: longest side capped at 512, albedo -> JPEG,
     normal maps stay PNG (lossless) so the lighting does not band,
  3. de-duplicates textures that several files embed copies of
     (digester_D, ramp_D, the concrete normal ...),
  4. merges the parts into a single GLB with the layout baked into node TRS.

Run:  python tools/build-regolith.py
Out:  public/lunar/regolith/regolith_plant.glb
"""

import hashlib
import io
import json
import os
import struct

from PIL import Image

SRC = "E:/UE/UmodelExport/EnvironmentGLB/regolith/StaticMesh"
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "lunar", "regolith", "regolith_plant.glb")

MAX_TEXTURE = 512        # longest side after optimisation
ALBEDO_QUALITY = 88      # JPEG quality for colour maps
NORMAL_MAX = 512         # normal maps keep full detail up to this size
HEAVY_TEXTURE = 200_000  # anything still above this many bytes ...
HEAVY_TEXTURE_SIDE = 256 # ... is re-encoded one level down

# label, source file, placement (metres, part-local space)
PARTS = [
    ("Digester", "Digester/digester_SM.glb"),
    ("O2Tank", "Misc/o2_storage_SM.glb"),
    ("Ramp", "Misc/ramp_SM.glb"),
    ("CouplingSingle", "Couplings/coupling_sockets_single_SM.glb"),
    ("CouplingTriple", "Couplings/coupling_sockets_triple_SM.glb"),
    ("Terminal", "Misc/computer_SM.glb"),
    ("TubeConnector", "Misc/detachable_tube_connector.glb"),
]


# ---------------------------------------------------------------- glb reading
def read_glb(path):
    with open(path, "rb") as handle:
        data = handle.read()
    if struct.unpack_from("<I", data, 0)[0] != 0x46546C67:
        raise ValueError("not a glb: " + path)
    offset = 12
    doc = None
    binary = b""
    while offset < len(data):
        length, kind = struct.unpack_from("<II", data, offset)
        chunk = data[offset + 8: offset + 8 + length]
        if kind == 0x4E4F534A:
            doc = json.loads(chunk.decode("utf-8"))
        elif kind == 0x004E4942:
            binary = chunk
        offset += 8 + length + ((4 - length % 4) % 4)
    return doc, binary


def view_bytes(doc, binary, index):
    view = doc["bufferViews"][index]
    start = view.get("byteOffset", 0)
    return binary[start: start + view["byteLength"]]


def part_bounds(doc):
    low = [float("inf")] * 3
    high = [float("-inf")] * 3
    for mesh in doc.get("meshes", []):
        for prim in mesh["primitives"]:
            accessor = doc["accessors"][prim["attributes"]["POSITION"]]
            for axis in range(3):
                low[axis] = min(low[axis], accessor["min"][axis])
                high[axis] = max(high[axis], accessor["max"][axis])
    return low, high


# --------------------------------------------------------------- glb building
class Builder:
    def __init__(self):
        self.buffer = bytearray()
        self.doc = {
            "asset": {"version": "2.0", "generator": "build-regolith.py"},
            "scene": 0,
            "scenes": [{"name": "RegolithPlant", "nodes": []}],
            "nodes": [],
            "meshes": [],
            "materials": [],
            "textures": [],
            "images": [],
            "samplers": [],
            "accessors": [],
            "bufferViews": [],
            "buffers": [],
        }
        self._samplers = {}
        self._images = {}
        self._materials = {}

    def add_view(self, payload, stride=None, target=None):
        while len(self.buffer) % 4:
            self.buffer.append(0)
        view = {"buffer": 0, "byteOffset": len(self.buffer), "byteLength": len(payload)}
        if stride:
            view["byteStride"] = stride
        if target:
            view["target"] = target
        self.buffer += payload
        self.doc["bufferViews"].append(view)
        return len(self.doc["bufferViews"]) - 1

    def sampler(self, source):
        key = (source.get("magFilter"), source.get("minFilter"),
               source.get("wrapS"), source.get("wrapT"))
        if key in self._samplers:
            return self._samplers[key]
        entry = {}
        for name, value in (("magFilter", key[0]), ("minFilter", key[1]),
                            ("wrapS", key[2]), ("wrapT", key[3])):
            if value is not None:
                entry[name] = value
        self.doc["samplers"].append(entry)
        self._samplers[key] = len(self.doc["samplers"]) - 1
        return self._samplers[key]


def optimise_image(name, payload, needs_alpha):
    """Resize + re-encode one texture. Returns (bytes, mimeType)."""
    original = Image.open(io.BytesIO(payload))
    original_format = original.format or "PNG"
    is_normal = "normal" in name.lower()

    def shrink(limit):
        width, height = original.size
        scale = min(1.0, limit / max(width, height))
        if scale >= 1.0:
            return original
        return original.resize((max(1, round(width * scale)), max(1, round(height * scale))),
                               Image.LANCZOS)

    def encode(limit):
        image = shrink(limit)
        if is_normal:
            # Normals must stay lossless — JPEG ringing on a normal map reads as dents.
            return _encode(image.convert("RGB"), "PNG")
        alpha = None
        if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
            alpha = image.convert("RGBA").getchannel("A").getextrema()
        if needs_alpha and alpha is not None and alpha != (255, 255):
            return _encode(image, "PNG")
        return _encode(image.convert("RGB"), "JPEG")

    encoded, mime = encode(NORMAL_MAX if is_normal else MAX_TEXTURE)
    # A few detail maps survive PNG compression badly; drop them a level so a
    # single tiling texture cannot dominate the download.
    if len(encoded) > HEAVY_TEXTURE and min(original.size) > HEAVY_TEXTURE_SIDE:
        smaller = encode(HEAVY_TEXTURE_SIDE)
        if len(smaller[0]) < len(encoded):
            encoded, mime = smaller

    # Never keep a result that is bigger than what we started with.
    if len(encoded) >= len(payload):
        return payload, Image.MIME.get(original_format, "image/png")
    return encoded, mime


def _encode(image, fmt):
    out = io.BytesIO()
    if fmt == "JPEG":
        image.save(out, format="JPEG", quality=ALBEDO_QUALITY, optimize=True, progressive=True)
        return out.getvalue(), "image/jpeg"
    image.save(out, format="PNG", optimize=True)
    return out.getvalue(), "image/png"


def merge_part(builder, label, doc, binary, translation, stats, alpha_images):
    """Copy one source file into the builder under a translated node."""
    # bufferViews that carry image bytes are replaced by the encoder below
    image_views = {image["bufferView"] for image in doc.get("images", []) if "bufferView" in image}
    view_map = {}

    def mapped_view(index):
        if index in image_views:
            return None
        if index not in view_map:
            view = doc["bufferViews"][index]
            view_map[index] = builder.add_view(
                view_bytes(doc, binary, index),
                stride=view.get("byteStride"),
                target=view.get("target"),
            )
        return view_map[index]

    def copy_accessor(index):
        source = dict(doc["accessors"][index])
        source["bufferView"] = mapped_view(source["bufferView"])
        builder.doc["accessors"].append(source)
        return len(builder.doc["accessors"]) - 1

    def copy_image(index):
        image = doc["images"][index]
        name = image.get("name") or f"{label}_image{index}"
        payload = view_bytes(doc, binary, image["bufferView"])
        digest = hashlib.sha1(payload).hexdigest()[:10]
        key = (os.path.splitext(name)[0], digest)
        if key in builder._images:
            return builder._images[key]
        encoded, mime = optimise_image(
            name, payload, os.path.splitext(name)[0] in alpha_images,
        )
        view = builder.add_view(encoded)
        builder.doc["images"].append({"name": os.path.splitext(name)[0], "mimeType": mime,
                                      "bufferView": view})
        stats["images"][key] = (len(payload), len(encoded), mime)
        builder._images[key] = len(builder.doc["images"]) - 1
        return builder._images[key]

    def copy_texture(index):
        texture = doc["textures"][index]
        sampler = builder.sampler(doc["samplers"][texture["sampler"]]) if "sampler" in texture else None
        image = copy_image(texture["source"]) if "source" in texture else None
        entry = {}
        if sampler is not None:
            entry["sampler"] = sampler
        if image is not None:
            entry["source"] = image
        builder.doc["textures"].append(entry)
        return len(builder.doc["textures"]) - 1

    def remap_texture_info(info):
        if not info:
            return None
        out = {"index": copy_texture(info["index"])}
        if "texCoord" in info:
            out["texCoord"] = info["texCoord"]
        return out

    def copy_material(index):
        source = doc["materials"][index]
        name = source.get("name", f"{label}_mat{index}")
        entry = {"name": name}
        pbr = source.get("pbrMetallicRoughness", {})
        mapped = {}
        if "baseColorFactor" in pbr:
            mapped["baseColorFactor"] = pbr["baseColorFactor"]
        base = remap_texture_info(pbr.get("baseColorTexture"))
        if base:
            mapped["baseColorTexture"] = base
        if "metallicFactor" in pbr:
            mapped["metallicFactor"] = pbr["metallicFactor"]
        if "roughnessFactor" in pbr:
            mapped["roughnessFactor"] = pbr["roughnessFactor"]
        metal = remap_texture_info(pbr.get("metallicRoughnessTexture"))
        if metal:
            mapped["metallicRoughnessTexture"] = metal
        if mapped:
            entry["pbrMetallicRoughness"] = mapped
        normal = remap_texture_info(source.get("normalTexture"))
        if normal:
            if "scale" in source["normalTexture"]:
                normal["scale"] = source["normalTexture"]["scale"]
            entry["normalTexture"] = normal
        emissive = remap_texture_info(source.get("emissiveTexture"))
        if emissive:
            entry["emissiveTexture"] = emissive
        if "emissiveFactor" in source:
            entry["emissiveFactor"] = source["emissiveFactor"]
        if "alphaMode" in source:
            entry["alphaMode"] = source["alphaMode"]
        if "doubleSided" in source:
            entry["doubleSided"] = source["doubleSided"]
        if "extras" in source:
            entry["extras"] = source["extras"]

        key = (name, json.dumps(entry, sort_keys=True))
        if key in builder._materials:
            return builder._materials[key]
        builder.doc["materials"].append(entry)
        builder._materials[key] = len(builder.doc["materials"]) - 1
        return builder._materials[key]

    primitives = []
    for mesh in doc["meshes"]:
        for prim in mesh["primitives"]:
            attributes = {name: copy_accessor(index) for name, index in prim["attributes"].items()}
            out = {"attributes": attributes}
            if "indices" in prim:
                out["indices"] = copy_accessor(prim["indices"])
            if "material" in prim:
                out["material"] = copy_material(prim["material"])
            if "mode" in prim:
                out["mode"] = prim["mode"]
            primitives.append(out)
            stats["triangles"] += doc["accessors"][prim["indices"]]["count"] // 3

    builder.doc["meshes"].append({"name": label, "primitives": primitives})
    builder.doc["nodes"].append({
        "name": label,
        "mesh": len(builder.doc["meshes"]) - 1,
        "translation": [round(value, 4) for value in translation],
    })
    builder.doc["scenes"][0]["nodes"].append(len(builder.doc["nodes"]) - 1)


def main():
    loaded = []
    for label, relative in PARTS:
        path = os.path.join(SRC, relative)
        doc, binary = read_glb(path)
        low, high = part_bounds(doc)
        loaded.append({"label": label, "doc": doc, "binary": binary,
                       "low": low, "high": high,
                       "size": [high[i] - low[i] for i in range(3)]})

    by_label = {part["label"]: part for part in loaded}
    digester = by_label["Digester"]
    tank = by_label["O2Tank"]
    ramp = by_label["Ramp"]
    single = by_label["CouplingSingle"]
    triple = by_label["CouplingTriple"]
    terminal = by_label["Terminal"]
    connector = by_label["TubeConnector"]

    # Layout, in metres. Everything is anchored to the digester's own bounds so
    # the assembly keeps working if the parts are ever swapped out.
    #
    # The kit is authored around a grade plane at y = 0, and two parts reach below
    # it on purpose: the O2 tank carries a 0.19 m footing ring (18.6% of its
    # vertices, its whole 1 x 1 m footprint) and the standalone digester front
    # carries a 0.20 m intake skirt. Those are meant to be buried, so the tank
    # stays on its authored origin instead of being lifted onto the surface.
    layout = {}
    layout["Digester"] = (0.0, -digester["low"][1], 0.0)
    digester_half_z = digester["size"][2] / 2

    tank_x = digester["high"][0] + 0.35 + tank["size"][0] / 2
    layout["O2Tank"] = (tank_x, 0.0, 0.15)

    ramp_z = digester["low"][2] - 0.15 - ramp["size"][2] / 2
    layout["Ramp"] = (0.0, -ramp["low"][1], ramp_z)

    layout["CouplingSingle"] = (
        tank_x + tank["size"][0] / 2 + 0.28,
        -single["low"][1],
        0.45,
    )
    layout["CouplingTriple"] = (
        digester["high"][0] + 0.18,
        -triple["low"][1],
        -digester_half_z * 0.55,
    )
    layout["Terminal"] = (
        ramp["size"][0] / 2 + 0.55,
        -terminal["low"][1],
        ramp_z + ramp["size"][2] * 0.25,
    )
    layout["TubeConnector"] = (
        (digester["high"][0] + tank_x - tank["size"][0] / 2) / 2,
        0.45,
        0.1,
    )

    builder = Builder()
    stats = {"triangles": 0, "images": {}}
    # Only cutout / blended materials need the alpha channel; every other map can
    # drop it and become a much smaller JPEG.
    alpha_images = set()
    for part in loaded:
        doc = part["doc"]
        for material in doc.get("materials", []):
            if material.get("alphaMode") not in ("BLEND", "MASK"):
                continue
            info = material.get("pbrMetallicRoughness", {}).get("baseColorTexture")
            if not info:
                continue
            texture = doc["textures"][info["index"]]
            name = doc["images"][texture["source"]].get("name")
            if name:
                alpha_images.add(os.path.splitext(name)[0])

    for part in loaded:
        merge_part(builder, part["label"], part["doc"], part["binary"],
                   layout[part["label"]], stats, alpha_images)

    binary = bytes(builder.buffer)
    binary += b"\x00" * ((4 - len(binary) % 4) % 4)
    builder.doc["buffers"] = [{"byteLength": len(binary)}]

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json_bytes = json.dumps(builder.doc, separators=(",", ":")).encode("utf-8")
    json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
    total = 12 + 8 + len(json_bytes) + 8 + len(binary)

    with open(OUT, "wb") as handle:
        handle.write(struct.pack("<III", 0x46546C67, 2, total))
        handle.write(struct.pack("<II", len(json_bytes), 0x4E4F534A))
        handle.write(json_bytes)
        handle.write(struct.pack("<II", len(binary), 0x004E4942))
        handle.write(binary)

    before = sum(stats["images"][key][0] for key in stats["images"])
    after = sum(stats["images"][key][1] for key in stats["images"])
    print(f"wrote {os.path.relpath(OUT)}  {total / 1048576:.2f} MB")
    print(f"  parts          : {len(loaded)}")
    print(f"  triangles      : {stats['triangles']:,}")
    print(f"  unique textures: {len(stats['images'])}  (deduplicated across files)")
    print(f"  texture bytes  : {before / 1048576:.2f} MB -> {after / 1048576:.2f} MB")
    print(f"  materials      : {len(builder.doc['materials'])}")
    for (name, digest), (src_len, dst_len, mime) in sorted(stats["images"].items()):
        print(f"    {name:38s} {src_len / 1024:7.0f} KB -> {dst_len / 1024:6.0f} KB  {mime}")


if __name__ == "__main__":
    main()
