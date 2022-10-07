import { html, LitElement } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';
import { when } from 'lit/directives/when.js';
import { $ } from '@mdui/jq/$.js';
import '@mdui/jq/methods/css.js';
import '@mdui/jq/methods/innerWidth.js';
import '@mdui/jq/methods/on.js';
import '@mdui/jq/methods/parent.js';
import { watch } from '@mdui/shared/decorators/watch.js';
import { animateTo, stopAnimations } from '@mdui/shared/helpers/animate.js';
import { emit } from '@mdui/shared/helpers/event.js';
import { Modal } from '@mdui/shared/helpers/modal.js';
import {
  DURATION_MEDIUM_IN,
  DURATION_MEDIUM_OUT,
  EASING_DECELERATION,
  EASING_ACCELERATION,
  EASING_LINEAR,
} from '@mdui/shared/helpers/motion.js';
import { lockScreen, unlockScreen } from '@mdui/shared/helpers/scroll.js';
import { componentStyle } from '@mdui/shared/lit-styles/component-style.js';
import { style } from './style.js';
import type { CSSResultGroup, TemplateResult } from 'lit';

/**
 * 在手机端，modal 始终为 true；大于手机端时，modal 属性才开始生效
 *
 * @event open - 在抽屉导航打开之前触发。可以通过调用 `event.preventDefault()` 阻止抽屉导航打开
 * @event opened - 在抽屉导航打开之后触发
 * @event close - 在抽屉导航关闭之前触发。可以通过调用 `event.preventDefault()` 阻止抽屉导航关闭
 * @event closed - 在抽屉导航关闭之后触发
 * @event overlay-click - 点击遮罩层时触发
 *
 * @slot - 抽屉导航中的内容
 *
 * @csspart overlay - 遮罩层
 * @csspart panel - 抽屉导航容器
 */
@customElement('mdui-navigation-drawer')
export class NavigationDrawer extends LitElement {
  static override styles: CSSResultGroup = [componentStyle, style];

  @query('.overlay')
  protected overlay!: HTMLElement;

  @query('.panel', true)
  protected panel!: HTMLElement;

  protected resizeObserver!: ResizeObserver;
  private modalHelper!: Modal;

  // 用于在打开抽屉导航前，记录当前聚焦的元素；在关闭抽屉导航后，把焦点还原到该元素上
  private originalTrigger!: HTMLElement;

  private get lockTarget() {
    return this.contained ? this.parentElement! : document.body;
  }

  private get isModal() {
    return this.handset || this.modal;
  }

  // 断点是否为手机，为 `true` 时，强制使用遮罩层
  @property({ type: Boolean, reflect: true })
  private handset = false;

  /**
   * 是否打开抽屉导航
   */
  @property({ type: Boolean, reflect: true })
  public open = false;

  /**
   * 打开时，是否显示遮罩层
   */
  @property({ type: Boolean, reflect: true })
  public modal = false;

  /**
   * 在含遮罩层时，是否在按下 ESC 键时，关闭抽屉导航
   */
  @property({ type: Boolean, attribute: 'close-on-esc' })
  public closeOnEsc = false;

  /**
   * 是否在点击遮罩时，关闭抽屉导航
   */
  @property({ type: Boolean, attribute: 'close-on-overlay-click' })
  public closeOnOverlayClick = false;

  /**
   * 抽屉导航的显示位置。可选值为：
   * * `left`
   * * `right`
   */
  @property()
  public placement: 'left' | 'right' = 'left';

  /**
   * 默认抽屉导航相对于 body 元素显示，该参数设置为 true 时，抽屉导航将相对于它的父元素显示
   *
   * Note:
   * 设置了该属性时，必须手动在父元素上设置样式 `position: relative; box-sizing: border-box;`
   */
  @property({ type: Boolean, reflect: true })
  public contained = false;

  override connectedCallback() {
    super.connectedCallback();
    this.modalHelper = new Modal(this);

    // 监听窗口尺寸变化，重新设置 handset 属性
    this.resizeObserver = new ResizeObserver(() => this.setHandset());

    $(this).on('keydown', (event: KeyboardEvent) => {
      if (
        this.open &&
        this.closeOnEsc &&
        event.key === 'Escape' &&
        this.isModal
      ) {
        event.stopPropagation();
        this.open = false;
      }
    });
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    unlockScreen(this, this.lockTarget);
  }

  /**
   * 重新计算并设置 handset 属性
   */
  private setHandset() {
    // 根元素参考值
    const baseFontSize = parseFloat($('html').css('font-size'));
    // 手机端断点值，单位可能为 px 或 rem
    const breakpointHandset = window
      .getComputedStyle(document.documentElement)
      .getPropertyValue('--mdui-breakpoint-handset')
      .toLowerCase();

    const containerWidth = this.contained
      ? $(this).parent().innerWidth()
      : $(window).innerWidth();

    this.handset = breakpointHandset.endsWith('rem')
      ? containerWidth < parseFloat(breakpointHandset) * baseFontSize
      : containerWidth < parseFloat(breakpointHandset);
  }

  // contained 变更后，修改监听尺寸变化的元素。为 true 时，监听父元素；为 false 时，监听 body
  @watch('contained')
  private onContainedChange() {
    if (this.hasUpdated) {
      this.resizeObserver.unobserve(
        this.contained ? document.body : this.parentElement!,
      );
    }
    this.resizeObserver.observe(
      this.contained ? this.parentElement! : document.body,
    );
  }

  @watch('open')
  protected async onOpenChange() {
    if (this.open) {
      const requestOpen = emit(this, 'open', {
        cancelable: true,
      });
      if (requestOpen.defaultPrevented) {
        return;
      }

      this.style.display = this.isModal ? 'block' : 'contents';
      this.originalTrigger = document.activeElement as HTMLElement;
      if (this.isModal) {
        this.modalHelper.activate();
        lockScreen(this, this.lockTarget);
      }

      await Promise.all([
        this.isModal
          ? stopAnimations(this.overlay)
          : stopAnimations(this.lockTarget),
        stopAnimations(this.panel),
      ]);

      // 设置聚焦
      requestAnimationFrame(() => {
        const autoFocusTarget = this.querySelector(
          '[autofocus]',
        ) as HTMLInputElement;
        if (autoFocusTarget) {
          autoFocusTarget.focus({ preventScroll: true });
        } else {
          this.panel.focus({ preventScroll: true });
        }
      });

      await Promise.all([
        this.isModal
          ? animateTo(this.overlay, [{ opacity: 0 }, { opacity: 1 }], {
              duration: DURATION_MEDIUM_IN,
              easing: EASING_LINEAR,
            })
          : animateTo(
              this.lockTarget,
              [
                {
                  [this.placement === 'right'
                    ? 'paddingRight'
                    : 'paddingLeft']: 0,
                },
                {
                  [this.placement === 'right' ? 'paddingRight' : 'paddingLeft']:
                    $(this.panel).innerWidth() + 'px',
                },
              ],
              {
                duration: DURATION_MEDIUM_IN,
                easing: EASING_DECELERATION,
                fill: 'forwards',
              },
            ),
        animateTo(
          this.panel,
          [
            {
              transform:
                this.placement === 'right'
                  ? 'translateX(100%)'
                  : 'translateX(-100%)',
            },
            {
              transform: 'translateX(0)',
            },
          ],
          {
            duration: DURATION_MEDIUM_IN,
            easing: EASING_DECELERATION,
          },
        ),
      ]);
      emit(this, 'opened');
    } else if (this.hasUpdated) {
      const requestClose = emit(this, 'close', {
        cancelable: true,
      });
      if (requestClose.defaultPrevented) {
        return;
      }

      if (this.isModal) {
        this.modalHelper.deactivate();
      }

      await Promise.all([
        this.isModal
          ? stopAnimations(this.overlay)
          : stopAnimations(this.lockTarget),
        stopAnimations(this.panel),
      ]);
      await Promise.all([
        this.isModal
          ? animateTo(this.overlay, [{ opacity: 1 }, { opacity: 0 }], {
              duration: DURATION_MEDIUM_OUT,
              easing: EASING_LINEAR,
            })
          : animateTo(
              this.lockTarget,
              [
                {
                  [this.placement === 'right' ? 'paddingRight' : 'paddingLeft']:
                    $(this.panel).innerWidth() + 'px',
                },
                {
                  [this.placement === 'right'
                    ? 'paddingRight'
                    : 'paddingLeft']: 0,
                },
              ],
              {
                duration: DURATION_MEDIUM_OUT,
                easing: EASING_ACCELERATION,
                fill: 'forwards',
              },
            ),
        animateTo(
          this.panel,
          [
            {
              transform: 'translateX(0)',
            },
            {
              transform:
                this.placement === 'right'
                  ? 'translateX(100%)'
                  : 'translateX(-100%)',
            },
          ],
          {
            duration: DURATION_MEDIUM_OUT,
            easing: EASING_ACCELERATION,
          },
        ),
      ]);
      this.style.display = 'none';

      if (this.isModal) {
        unlockScreen(this, this.lockTarget);
      }

      // 抽屉导航关闭后，恢复焦点到原有的元素上
      const trigger = this.originalTrigger;
      if (typeof trigger?.focus === 'function') {
        setTimeout(() => trigger.focus());
      }

      emit(this, 'closed');
    }
  }

  protected onOverlayClick() {
    emit(this, 'overlay-click');
    if (!this.closeOnOverlayClick) {
      return;
    }

    this.open = false;
  }

  protected override render(): TemplateResult {
    return html`${when(
        this.isModal,
        () => html`<div
          part="overlay"
          class="overlay"
          @click=${this.onOverlayClick}
        ></div>`,
      )}
      <div part="panel" class="panel" tabindex="0"><slot></slot></div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mdui-navigation-drawer': NavigationDrawer;
  }
}
