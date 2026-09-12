import { TriangleAlert } from 'lucide-react';

import { ApiErrorReportsTab } from '../ApiErrorReportsTab';
import type { SettingsSectionContext, SettingsSectionDefinition } from './types';

function ApiErrorsSection({ loadApiErrorReports, clearApiErrorReports }: SettingsSectionContext) {
  return <ApiErrorReportsTab loadApiErrorReports={loadApiErrorReports} clearApiErrorReports={clearApiErrorReports} />;
}

export const apiErrorsSection: SettingsSectionDefinition = {
  key: 'apiErrors',
  label: '错误报告',
  icon: '!',
  navIcon: TriangleAlert,
  group: 'connection',
  subtitle: 'API 失败原因记录',
  Component: ApiErrorsSection,
};
