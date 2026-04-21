import { logPollerStatus } from "./logPollerStatus";
import { PollerInstance, pollerRegistry } from "./pollers";

export class PollerManager {
  private pollers: PollerInstance[] = [];

  startAll() {
    pollerRegistry.forEach((entry) => {
      logPollerStatus(entry);

      if (entry.enabled) {
        const instance = entry.create();
        instance.start();
        this.pollers.push(instance);
      }
    });
  }

  stopAll() {
    for (const p of this.pollers) {
      p.stop();
    }
  }
}
