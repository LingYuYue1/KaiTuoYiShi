import { useCallback } from 'react';
import {
  fetchModels as fetchModelsImpl,
  testConnection as testConnectionImpl,
  type ConnectionTestConfig,
  type ConnectionTestResult,
} from '@/services/ai/apiTools';
import {
  fetchComfyWorkflowCandidates as fetchComfyWorkflowCandidatesImpl,
  fetchImageGenerationModels as fetchImageGenerationModelsImpl,
  testImageGenerationConnection as testImageGenerationConnectionImpl,
  type ComfyWorkflowCandidate,
} from '@/services/ai/imageGeneration';
import {
  clearApiErrorReports as clearApiErrorReportsImpl,
  loadApiErrorReports as loadApiErrorReportsImpl,
  type ApiErrorReport,
} from '@/services/ai/apiErrorReportService';
import type { 文生图API配置 } from '@/models/settings';
import { devLog, devLogError } from '@/utils/devLog';

// 收敛门面所需类型原样复导出，供各 tab 只从 useAiTools 取类型，避免直连 services/ai。
export type { ConnectionTestConfig, ConnectionTestResult } from '@/services/ai/apiTools';
export type { ComfyWorkflowCandidate } from '@/services/ai/imageGeneration';
export type { ApiErrorReport } from '@/services/ai/apiErrorReportService';

/**
 * 设置面板 AI 直连用例动作（片 panel-p3，审计破口 ③ 收敛）。
 *
 * 10 个 Settings tab 对 services/ai 的直连调用（apiTools.fetchModels/testConnection、
 * imageGeneration 连接探测与批量探测、apiErrorReportService 加载/清空）统一收敛到本
 * 管理器，经 SettingsModal/App 注入的动作调用。动作内部「devLog 埋点 → 调原函数」，
 * 失败走 devLogError 后继续抛错——各 tab 的 try/catch 消息链路（loading/flash/提示）
 * 语义完全保留。
 *
 * 语义约束：调用参数、返回处理与收敛前完全一致，仅统一入口；管理器无状态，只作
 * 写入/探测侧门面。
 */

export interface AiToolsActions {
  /** 获取模型列表（主配置 / 辅助 API / 变量覆盖等共用）。 */
  fetchModels: (config: ConnectionTestConfig) => Promise<string[]>;
  /** 连接测试（文本类接口）。 */
  testConnection: (config: ConnectionTestConfig) => Promise<ConnectionTestResult>;
  /** 文生图连接探测。 */
  testImageGenerationConnection: (config: 文生图API配置) => Promise<string>;
  /** 文生图模型列表（含 ComfyUI checkpoint / SD WebUI / NovelAI 分支）。 */
  fetchImageGenerationModels: (config: 文生图API配置) => Promise<string[]>;
  /** ComfyUI 队列/历史工作流候选。 */
  fetchComfyWorkflowCandidates: (
    config: 文生图API配置,
    source: 'queue' | 'history',
  ) => Promise<ComfyWorkflowCandidate[]>;
  /** 加载 API 错误报告。 */
  loadApiErrorReports: () => Promise<ApiErrorReport[]>;
  /** 清空 API 错误报告。 */
  clearApiErrorReports: () => Promise<void>;
}

export function useAiTools(): AiToolsActions {
  const fetchModels = useCallback(async (config: ConnectionTestConfig) => {
    try {
      const list = await fetchModelsImpl(config);
      devLog('ui', 'ai-tools-fetch-models', { count: list.length, provider: config.provider });
      return list;
    } catch (err) {
      devLogError('ui', 'ai-tools-fetch-models-failed', err, { provider: config.provider });
      throw err;
    }
  }, []);

  const testConnection = useCallback(async (config: ConnectionTestConfig) => {
    try {
      const result = await testConnectionImpl(config);
      devLog('ui', 'ai-tools-test-connection', { ok: result.ok, provider: config.provider });
      return result;
    } catch (err) {
      devLogError('ui', 'ai-tools-test-connection-failed', err, { provider: config.provider });
      throw err;
    }
  }, []);

  const testImageGenerationConnection = useCallback(async (config: 文生图API配置) => {
    try {
      const result = await testImageGenerationConnectionImpl(config);
      devLog('ui', 'ai-tools-test-image-connection', { backend: config.backend });
      return result;
    } catch (err) {
      devLogError('ui', 'ai-tools-test-image-connection-failed', err, { backend: config.backend });
      throw err;
    }
  }, []);

  const fetchImageGenerationModels = useCallback(async (config: 文生图API配置) => {
    try {
      const list = await fetchImageGenerationModelsImpl(config);
      devLog('ui', 'ai-tools-fetch-image-models', { count: list.length, backend: config.backend });
      return list;
    } catch (err) {
      devLogError('ui', 'ai-tools-fetch-image-models-failed', err, { backend: config.backend });
      throw err;
    }
  }, []);

  const fetchComfyWorkflowCandidates = useCallback(
    async (config: 文生图API配置, source: 'queue' | 'history') => {
      try {
        const list = await fetchComfyWorkflowCandidatesImpl(config, source);
        devLog('ui', 'ai-tools-fetch-comfy-workflows', { count: list.length, source });
        return list;
      } catch (err) {
        devLogError('ui', 'ai-tools-fetch-comfy-workflows-failed', err, { source });
        throw err;
      }
    },
    [],
  );

  const loadApiErrorReports = useCallback(async () => {
    try {
      const reports = await loadApiErrorReportsImpl();
      devLog('ui', 'ai-tools-load-error-reports', { count: reports.length });
      return reports;
    } catch (err) {
      devLogError('ui', 'ai-tools-load-error-reports-failed', err);
      throw err;
    }
  }, []);

  const clearApiErrorReports = useCallback(async () => {
    try {
      await clearApiErrorReportsImpl();
      devLog('ui', 'ai-tools-clear-error-reports', {});
    } catch (err) {
      devLogError('ui', 'ai-tools-clear-error-reports-failed', err);
      throw err;
    }
  }, []);

  return {
    fetchModels,
    testConnection,
    testImageGenerationConnection,
    fetchImageGenerationModels,
    fetchComfyWorkflowCandidates,
    loadApiErrorReports,
    clearApiErrorReports,
  };
}
