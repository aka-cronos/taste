/**
 * Runs `migrate` on each call until one run succeeds, then never again.
 *
 * Workers cancel a request's I/O when that request ends, so a pending promise
 * shared across requests may never settle and would hang every later request
 * in the isolate. Each caller therefore awaits only the run it started.
 */
export function createSchemaGate(migrate: () => Promise<void>) {
  let ready = false
  return async () => {
    if (ready) {
      return
    }
    try {
      await migrate()
    } catch {
      // A concurrent cold-start run may have created the same table first;
      // a second run diffs against the updated schema.
      await migrate()
    }
    ready = true
  }
}
