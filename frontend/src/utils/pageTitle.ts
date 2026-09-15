import { useEffect } from 'react';

export const DEFAULT_PAGE_TITLE = 'renpy.online';

export const getRenpyOnlinePageTitle = (projectName: string | null | undefined): string => {
  const normalizedProjectName = projectName?.trim();
  return normalizedProjectName || DEFAULT_PAGE_TITLE;
};

export const useRenpyOnlineDocumentTitle = (projectName: string | null | undefined): void => {
  useEffect(() => {
    document.title = getRenpyOnlinePageTitle(projectName);

    return () => {
      document.title = DEFAULT_PAGE_TITLE;
    };
  }, [projectName]);
};
