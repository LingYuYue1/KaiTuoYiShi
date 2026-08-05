import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import {
  StoryArchiveReader,
  type StoryArchiveChapter,
  type StoryArchiveVolume,
} from '../components/features/ZhikuV3/StoryArchiveReader';

const volumeOneChapters: StoryArchiveChapter[] = [
  {
    id: 'story-demo-01',
    number: '第一章',
    title: '从黄金中醒来',
    subtitle: '神谕沉默之后',
    category: '开拓主线',
    location: '翁法罗斯',
    timeLabel: '逐火纪元初期',
    summary: '长夜尚未退去，英雄们第一次在神谕之外听见属于自己的选择。',
    status: 'read',
    body: `太阳从云层背后升起时，奥赫玛的金色屋脊仍浸在长夜留下的阴影里。城中没有钟声，只有风穿过石柱与旗帜，将昨夜未曾说完的神谕吹向更远的街巷。

旅人从铺满细沙的阶梯上醒来。掌心残留着微弱的温度，像有人曾把一簇将熄未熄的火放在那里。四周的人群匆匆经过，没有谁能说清这火来自何处，也没有谁敢轻易将它熄灭。

远处，英雄们的雕像静默地望向城市。吟游诗人口中的名字被黄金保存了千年，可雕像投下的阴影里，仍有无数没有被记录的人走向同一片晨光。

“神谕没有回答你。”守在阶梯旁的人说，“也许这一次，答案要由我们自己去找。”

旅人握紧掌心。火光在指缝间亮起，翁法罗斯的英雄纪由此翻开了新的一页。`,
  },
  {
    id: 'story-demo-02',
    number: '第二章',
    title: '无名英雄的火种',
    subtitle: '黎明前的同行者',
    category: '开拓主线',
    location: '奥赫玛',
    timeLabel: '远征前夜',
    summary: '没有被史诗记住的人，在出发前把一簇微弱的火交给了后来者。',
    status: 'read',
    body: `远征名单被钉在议事厅外墙时，最下方仍留着一行空白。书记官说那是留给英雄的位置，可真正走到墙前的人都知道，并不是每一位踏上道路的人都能拥有被铭刻的名字。

一名年迈的铸匠从人群后走来，把装有余火的青铜灯交给旅人。灯罩上没有家徽，没有颂词，只有经年累月留下的锤痕。

“史诗会记住胜利者。”他说，“但道路需要所有人的脚步。”

旅人接过铜灯。那簇火并不耀眼，却照亮了名单最下方没有姓名的位置。短暂的寂静后，第一个人走到墙前写下自己的名字，随后是第二个、第三个。

黎明到来以前，英雄的火种先在人群之间传递了起来。`,
  },
  {
    id: 'story-demo-03',
    number: '第三章',
    title: '神悟树庭的长夜',
    subtitle: '黄金裔议事夜',
    category: '开拓主线',
    location: '神悟树庭',
    timeLabel: '远征启程前',
    summary: '逐火远征即将开始。树庭灯火未熄，每个人都必须为明日留下自己的答案。',
    status: 'current',
    body: `神悟树庭的灯火彻夜未熄。枝叶在高处彼此摩擦，发出潮水般的低响，古老石壁上的黄金纹路随风明灭，像整座庭院仍在缓慢呼吸。

长桌两侧坐满了即将参加逐火远征的人。有人反复检查地图，有人沉默地擦拭武器，也有人把写给家人的信折了又折，却始终没有交给门外等候的信使。

旅人站在树庭中央，听见不同的意见在穹顶下交错。神谕留下的道路只有一条，真正摆在众人面前的选择却远不止一条。每个人都知道远征必须出发，也都清楚出发并不等于能够归来。

午夜过后，第一盏灯熄灭了。负责守夜的年轻人把它重新点亮，然后是第二盏、第三盏。没有人下令，但长桌旁的人们陆续起身，将各自带来的火放到庭院中央。

细小的火焰汇聚成明亮的金色。它照见地图上尚未探明的荒原，也照见每一张不再回避的脸。

“我们不是为了成为传说而出发。”有人终于开口，“是为了让后来的人不必只活在传说里。”

树庭外，长夜正在退去。远征的旗帜第一次迎风展开，黎明从群山背后缓慢升起。`,
  },
  {
    id: 'story-demo-04',
    number: '第四章',
    title: '远征者的第一步',
    subtitle: '火种越过城门',
    category: '开拓主线',
    location: '纷争荒墟',
    timeLabel: '远征启程',
    summary: '城门在身后合拢，英雄纪第一次离开吟游诗人的纸页，落到真实道路上。',
    status: 'unread',
    body: `城门开启时，清晨的风卷起旗帜，也卷走了石阶上最后一点夜色。守城人没有敲响送行的钟，因为逐火者相信，真正的归来应当由凯旋的钟声宣告。

队伍越过黄金城墙，脚下的道路很快被荒原吞没。身后的奥赫玛逐渐缩成一道明亮的线，前方只有起伏的黑色山脊和无人标注的旧日遗迹。

旅人回头看了一次。铜灯中的火仍然安静燃烧，映出同行者不同的面容。

没有吟游诗人站在路边，也没有人提前写好这一章的结局。远征者迈出的第一步落进尘土，故事终于从纸页来到现实。`,
  },
  {
    id: 'story-demo-05',
    number: '第五章',
    title: '未解锁章节',
    subtitle: '故事仍在远方',
    category: '开拓主线',
    body: '',
    status: 'locked',
  },
];

const volumes: StoryArchiveVolume[] = [
  {
    id: 'amphoreus-heroic-saga-01',
    number: '卷宗 01',
    title: '翁法罗斯英雄纪其一-黄金裔的黎明',
    subtitle: '主线档案 · 4 个章节',
    chapters: volumeOneChapters,
  },
  {
    id: 'amphoreus-heroic-saga-02',
    number: '卷宗 02',
    title: '翁法罗斯英雄纪其二-逐火远征',
    subtitle: '主线档案 · 3 个章节',
    chapters: [
      {
        id: 'story-demo-06',
        number: '第一章',
        title: '荒原上的金线',
        subtitle: '远征途中',
        category: '开拓主线',
        location: '纷争荒墟',
        timeLabel: '远征第二日',
        summary: '金色道路穿过荒原，通向无人能够预言的下一段命运。',
        status: 'unread',
        body: volumeOneChapters[3].body,
      },
      {
        id: 'story-demo-07',
        number: '第二章',
        title: '风中的誓言',
        subtitle: '未被记录的约定',
        category: '开拓主线',
        body: '',
        status: 'locked',
      },
      {
        id: 'story-demo-08',
        number: '第三章',
        title: '尚未抵达之地',
        subtitle: '故事仍在远方',
        category: '开拓主线',
        body: '',
        status: 'locked',
      },
    ],
  },
  {
    id: 'amphoreus-heroic-saga-03',
    number: '卷宗 03',
    title: '翁法罗斯英雄纪其三-尚未揭晓',
    subtitle: '档案尚未开放',
    chapters: [],
    locked: true,
  },
];

const meta = {
  title: '开拓轶事/智库 V3/二级页面',
  component: StoryArchiveReader,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    volumes,
    initialChapterId: 'story-demo-03',
    onBack: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof StoryArchiveReader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 剧情档案阅读页: Story = {};

export const 减少动画阅读页: Story = {
  args: { reducedMotion: true },
};
