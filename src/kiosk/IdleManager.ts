/**
 * 입력이 없을 때의 동작을 관리합니다.
 * - warnAfter초 동안 입력이 없으면 onWarn (안내 반복), 이후 warnAfter초마다 반복
 * - returnAfter초 동안 입력이 없으면 onTimeout (메인 메뉴 복귀)
 * tick(now)을 주기적으로 호출하는 순수 로직이라 테스트하기 쉽습니다.
 */
export interface IdleConfig {
  warnAfterSec: number;
  returnAfterSec: number;
}

export class IdleManager {
  private lastActivity: number;
  private lastWarn: number;
  private fired = false;

  constructor(
    private cfg: IdleConfig,
    private handlers: { onWarn: () => void; onTimeout: () => void },
    now: number,
  ) {
    this.lastActivity = now;
    this.lastWarn = now;
  }

  setConfig(cfg: IdleConfig) {
    this.cfg = cfg;
  }

  activity(now: number) {
    this.lastActivity = now;
    this.lastWarn = now;
    this.fired = false;
  }

  idleSeconds(now: number) {
    return (now - this.lastActivity) / 1000;
  }

  tick(now: number) {
    if (this.fired) return;
    const idle = now - this.lastActivity;
    if (idle >= this.cfg.returnAfterSec * 1000) {
      this.fired = true;
      this.handlers.onTimeout();
      return;
    }
    if (now - this.lastWarn >= this.cfg.warnAfterSec * 1000) {
      this.lastWarn = now;
      this.handlers.onWarn();
    }
  }
}
