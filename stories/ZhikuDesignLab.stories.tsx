import type { Meta, StoryObj } from '@storybook/react-vite';
import { ZhikuDesignLab } from '../components/features/ZhikuV2/ZhikuDesignLab';
import { DEFAULT_ZHIKU_DESIGN_LAYOUT } from '../components/features/ZhikuV2/types';

const meta = {
  title: '开拓轶事/智库 V2/可视化设计台',
  component: ZhikuDesignLab,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: '使用智库 V2 真实组件进行九分类星图构图。点击右上角保存按钮后，布局会写入浏览器并在刷新时恢复；设计台不接入生产智库。',
      },
    },
  },
} satisfies Meta<typeof ZhikuDesignLab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 星图布局编辑: Story = {};

export const 减少动画: Story = {
  args: { initialReducedMotion: true },
};

export const 十六比十视口: Story = {
  args: {
    initialLayout: { ...DEFAULT_ZHIKU_DESIGN_LAYOUT, viewportId: 'desktop-16-10' },
    persistenceKey: null,
  },
};
