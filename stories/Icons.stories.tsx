import type { Meta, StoryObj } from '@storybook/react-vite';
import { Icons } from '../components/ui/Icons';

function IconGallery() {
  return (
    <div className="grid grid-cols-4 gap-3 p-6 md:grid-cols-6">
      {Object.entries(Icons).map(([name, glyph]) => (
        <div
          key={name}
          className="flex flex-col items-center gap-1 rounded border border-white/10 p-3"
        >
          <span className="text-2xl">{glyph}</span>
          <span className="text-xs opacity-80">{name}</span>
        </div>
      ))}
    </div>
  );
}

const meta = {
  title: '开拓轶事/Icons 图标表',
  component: IconGallery,
  parameters: {
    docs: { description: { component: '项目当前的全部图标（emoji 映射表）。后续 UI 升级如果换成 SVG 图标，可以在这里对照。' } },
  },
} satisfies Meta<typeof IconGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 全部图标: Story = {};
