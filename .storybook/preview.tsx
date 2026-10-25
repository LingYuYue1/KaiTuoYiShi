import type { Preview } from '@storybook/react-vite'
import '@/styles/tailwind.css';
import '@/styles/root-theme.css';
import '@/styles/global.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },
  },
};

export default preview;