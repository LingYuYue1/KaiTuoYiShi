import type { Meta, StoryObj } from '@storybook/react-vite';
import { Modal } from '../components/ui/Modal';

const meta = {
  title: '开拓轶事/Modal 弹窗',
  component: Modal,
  parameters: {
    layout: 'fullscreen',
    docs: { description: { component: '项目通用弹窗：遮罩 + 居中窗体 + 渐变标题 + Esc/点遮罩关闭。' } },
  },
  args: {
    onClose: () => {},
  },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 带标题: Story = {
  args: {
    title: '设置',
    children: (
      <div className="space-y-3 text-sm">
        <p>这里是弹窗内容区域，可以放任何东西。</p>
        <p>按 Esc 或点击遮罩可以关闭（Storybook 里 onClose 是空函数，不会真的关掉）。</p>
      </div>
    ),
  },
};

export const 无标题: Story = {
  args: {
    children: <p className="text-sm">没有 title 时不渲染标题栏和分隔线。</p>,
  },
};

export const 长内容滚动: Story = {
  args: {
    title: '智库',
    children: (
      <div className="space-y-2 text-sm">
        {Array.from({ length: 40 }, (_, i) => (
          <p key={i}>第 {i + 1} 条内容——用来验证内容区超高时的滚动表现。</p>
        ))}
      </div>
    ),
  },
};
