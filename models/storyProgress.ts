export interface 剧情推进建议 {
  id: string;
  系列ID: string;
  分段ID: string;
  下一分段ID?: string;
  系列标题: string;
  分段标题: string;
  下一分段标题?: string;
  理由: string;
  置信度: '低' | '中' | '高';
  createdAt: number;
}
