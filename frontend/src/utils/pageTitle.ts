import { useEffect } from 'react';

export const DEFAULT_PAGE_TITLE = 'Plotmio';

export const getPlotmioPageTitle = (projectName: string | null | undefined): string => {
  const normalizedProjectName = projectName?.trim();
  return normalizedProjectName ? `${normalizedProjectName} · ${DEFAULT_PAGE_TITLE}` : DEFAULT_PAGE_TITLE;
};

export const usePlotmioDocumentTitle = (projectName: string | null | undefined): void => {
  useEffect(() => {
    document.title = getPlotmioPageTitle(projectName);

    return () => {
      document.title = DEFAULT_PAGE_TITLE;
    };
  }, [projectName]);
};
