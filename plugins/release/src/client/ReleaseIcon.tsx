/**
 * 侧边栏面板图标：一条向上推送的分支箭头，选中时随 active 加深。
 */
import type { ReactElement } from 'react';

export interface ReleaseIconProps {
  /** 请求的方形边长（像素）。 */
  size: number;
  /** 当前面板是否处于选中态。 */
  active: boolean;
}

export function ReleaseIcon({ size, active }: ReleaseIconProps): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 1.9 : 1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ opacity: active ? 1 : 0.72 }}
    >
      <path d="M7 20V9" />
      <circle cx="7" cy="5" r="2.4" />
      <path d="M7 13c0-2.2 1.8-4 4-4h4.5" />
      <circle cx="17.5" cy="9" r="2.2" />
      <path d="M14 20l3-3.6 3 3.6" />
    </svg>
  );
}
