const pendingApprovals = new Map<string, (approved: boolean) => void>();

export function waitForApproval(confirmId: string): Promise<boolean> {
  return new Promise((resolve) => {
    pendingApprovals.set(confirmId, resolve);
    setTimeout(() => {
      if (pendingApprovals.has(confirmId)) {
        pendingApprovals.delete(confirmId);
        resolve(false);
      }
    }, 60000);
  });
}

export function resolveApproval(confirmId: string, approved: boolean) {
  const resolve = pendingApprovals.get(confirmId);
  if (resolve) {
    resolve(approved);
    pendingApprovals.delete(confirmId);
  }
}
