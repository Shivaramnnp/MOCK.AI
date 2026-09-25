import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ExamAsset } from './ExamAsset';

describe('ExamAsset Component', () => {
  it('should return null when url is null, undefined, or empty', () => {
    const { container: c1 } = render(<ExamAsset url={null} alt="Test" />);
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(<ExamAsset url={undefined} alt="Test" />);
    expect(c2.firstChild).toBeNull();

    const { container: c3 } = render(<ExamAsset url="" alt="Test" />);
    expect(c3.firstChild).toBeNull();
  });

  it('should render diagram variant with zoom button', () => {
    const onZoom = vi.fn();
    const { container, getByAltText, getByRole } = render(
      <ExamAsset
        url="/exam-assets/gate/2025/cs-1/q5_diag.png"
        alt="Question 5 Figure"
        variant="diagram"
        onZoom={onZoom}
      />
    );

    const img = getByAltText('Question 5 Figure');
    expect(img).toBeDefined();

    const zoomButton = getByRole('button');
    expect(zoomButton.textContent).toContain('Click to enlarge figure');

    fireEvent.click(zoomButton);
    expect(onZoom).toHaveBeenCalledTimes(1);
  });

  it('should render option variant with compact container and no zoom button', () => {
    const { container, getByAltText } = render(
      <ExamAsset
        url="/exam-assets/ssc/chsl/2024/ssc-chsl-2024-01jul-s1/q27_opt_a.png"
        alt="Option A figure"
        variant="option"
      />
    );

    const img = getByAltText('Option A figure');
    expect(img).toBeDefined();

    const zoomButton = container.querySelector('button');
    expect(zoomButton).toBeNull();
  });

  it('should display graceful error retry UI when image fails to load (onError)', () => {
    const { getByAltText, getByText } = render(
      <ExamAsset
        url="/exam-assets/corrupted-or-404-image.png"
        alt="Broken figure"
        variant="diagram"
      />
    );

    const img = getByAltText('Broken figure');
    expect(img).toBeDefined();

    // Trigger image error (e.g. 404 or corrupted asset)
    fireEvent.error(img);

    // Component should re-render with error indicator and retry button
    expect(getByText(/Figure failed to load: Broken figure/i)).toBeDefined();
    const retryBtn = getByText(/Retry Loading/i);
    expect(retryBtn).toBeDefined();

    // Clicking retry resets error state
    fireEvent.click(retryBtn);
    expect(getByAltText('Broken figure')).toBeDefined();
  });
});
