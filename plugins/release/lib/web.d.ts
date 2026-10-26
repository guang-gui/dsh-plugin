import type { Context } from '@deepseek-ai/cordis';
import type { ReleaseService } from './service.js';
/** 页面与 API 共用的路径前缀。 */
export declare const WEB_UI_PATH = "/release-ui";
/**
 * 把发版控制台挂到当前 profile 的 web 服务上。
 * @param ctx 插件上下文
 * @param service 与工具共用的发版服务
 */
export declare function registerWebUi(ctx: Context, service: ReleaseService): void;
