import type { PhoneReplyGenerator } from '@/src/kernel/ports/PhoneReplyGenerator';
import { buildPhoneApiConfig, generatePhoneReply } from '@/services/ai/phoneService';

export class BrowserPhoneReplyGenerator implements PhoneReplyGenerator {
  async generate(
    settings: Parameters<PhoneReplyGenerator['generate']>[0],
    request: Parameters<PhoneReplyGenerator['generate']>[1],
    signal: Parameters<PhoneReplyGenerator['generate']>[2],
  ) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const config = buildPhoneApiConfig(settings);
    const result = await generatePhoneReply(
      config,
      { ...request, npcRecords: [...request.npcRecords], news: [...request.news], contacts: [...request.contacts], mainChatHistory: [...request.mainChatHistory] },
      config.retryCount ?? 2,
      settings.promptModules,
    );
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return { messages: result.messages, summary: result.summary };
  }
}
