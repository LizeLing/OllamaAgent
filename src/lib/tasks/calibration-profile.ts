import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import { DATA_DIR } from '@/lib/config/constants';
import { atomicWriteJSON, safeReadJSON } from '@/lib/storage/atomic-write';
import { withFileLock } from '@/lib/storage/file-lock';
import { CalibrationProfile, CalibrationProfileQuery } from '@/types/task';

const CALIBRATION_PROFILES_FILE = path.join(DATA_DIR, 'tasks', 'calibration-profiles.json');

function matchesProfile(profile: CalibrationProfile, query: CalibrationProfileQuery): boolean {
  return (
    profile.machineFingerprint === query.machineFingerprint &&
    profile.model === query.model &&
    profile.numCtx === query.numCtx &&
    profile.workloadType === query.workloadType
  );
}

function sortByMeasuredAtDesc(
  left: CalibrationProfile,
  right: CalibrationProfile
): number {
  return new Date(right.measuredAt).getTime() - new Date(left.measuredAt).getTime();
}

export function getMachineFingerprint(): string {
  const cpuModels = os.cpus().map((cpu) => cpu.model).join('|');
  const raw = [
    os.platform(),
    os.arch(),
    String(os.cpus().length),
    String(os.totalmem()),
    cpuModels,
  ].join('::');

  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

export async function listCalibrationProfiles(): Promise<CalibrationProfile[]> {
  const profiles = await safeReadJSON<CalibrationProfile[]>(CALIBRATION_PROFILES_FILE, []);
  return profiles.sort(sortByMeasuredAtDesc);
}

export async function findCalibrationProfile(
  query: CalibrationProfileQuery
): Promise<CalibrationProfile | null> {
  const profiles = await listCalibrationProfiles();
  return profiles.find((profile) => matchesProfile(profile, query)) ?? null;
}

export async function saveCalibrationProfile(
  profile: CalibrationProfile
): Promise<CalibrationProfile> {
  return withFileLock(CALIBRATION_PROFILES_FILE, async () => {
    const profiles = await listCalibrationProfiles();
    const nextProfiles = profiles.filter(
      (current) => !matchesProfile(current, profile)
    );
    nextProfiles.push(profile);
    nextProfiles.sort(sortByMeasuredAtDesc);
    await atomicWriteJSON(CALIBRATION_PROFILES_FILE, nextProfiles);
    return profile;
  });
}
