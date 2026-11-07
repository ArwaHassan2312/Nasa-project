export function selectNextMissionNotification({ day, eventFailureNotices = [] }) {
  const notice = eventFailureNotices
    .filter((notice) => notice.day <= day)
    .sort((first, second) => first.day - second.day)[0];
  return notice ? { type: 'event-failure', notice } : null;
}
