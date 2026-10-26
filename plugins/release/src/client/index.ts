/**
 * 浏览器半入口：把发版面板挂进 DSH 的侧边栏与主内容区。
 *
 * 页面自己通过 `/release-ui/api/*` 与宿主通信，所以这里只做两件声明式的事：
 * 侧边栏加一个入口（`sidebar.panellist`），主内容区加一个同 id 的面板（`main`）。
 * 二者的 id/key 必须一致，侧边栏点击时由布局层完成切换。
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { ReleasePage } from './ReleasePage.tsx';
import { ReleaseIcon } from './ReleaseIcon.tsx';

/** 面板标识：`sidebar.panellist` 的 id 与 `main` 的 key 必须相同。 */
const PANEL_ID = 'release';

/** 需要的宿主服务：slot 注册表。 */
export const inject = ['slots'];

/**
 * 浏览器半的插件体。
 * @param ctx 浏览器端根上下文
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    ctx.slots.inject('main', () =>
      ctx.slots.register({ name: 'main', key: PANEL_ID }, ReleasePage),
    );
  }, 'release: main panel');
  ctx.effect(() => {
    ctx.slots.inject('sidebar.panellist', () =>
      ctx.slots.register(
        { name: 'sidebar.panellist', id: PANEL_ID, order: 10, label: '发版' },
        ReleaseIcon,
      ),
    );
  }, 'release: sidebar entry');
}
