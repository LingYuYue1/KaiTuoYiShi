// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SafeAlbumImage } from '@/components/features/GameSystems/album/workspaceComponents';

describe('album image states', () => {
  it('shows a clear failure state only when the fallback image also fails', () => {
    render(<SafeAlbumImage src="/missing-album-image.webp" alt="相册图片" className="h-20 w-20" />);

    fireEvent.error(screen.getByRole('img', { name: '相册图片' }));
    expect(screen.getByRole('img', { name: '相册图片' })).toBeInTheDocument();

    fireEvent.error(screen.getByRole('img', { name: '相册图片' }));
    expect(screen.getByText('图片失效')).toBeInTheDocument();
  });

  it('clears a previous failure when the user selects another image', () => {
    const { rerender } = render(
      <SafeAlbumImage src="/missing-album-image.webp" alt="相册图片" className="h-20 w-20" />,
    );

    fireEvent.error(screen.getByRole('img', { name: '相册图片' }));
    fireEvent.error(screen.getByRole('img', { name: '相册图片' }));
    rerender(<SafeAlbumImage src="/replacement-album-image.webp" alt="相册图片" className="h-20 w-20" />);

    expect(screen.getByRole('img', { name: '相册图片' })).toBeInTheDocument();
    expect(screen.queryByText('图片失效')).not.toBeInTheDocument();
  });
});
