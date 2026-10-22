'use server';

import { challengeSchema, challengeStatusSchema, joinSchema, rewardSchema, reviewSubmissionSchema, submissionSchema } from '@/lib/validation/challenges';
import { runAction, type ActionState } from '../action';
import * as svc from '../services/challenges';

const R = ['/challenges', '/admin/challenges', '/dashboard', '/admin'];

export async function saveChallengeAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: challengeSchema, admin: true, revalidate: R }, async ({ tx, session, data }) => {
    await svc.saveChallenge(tx, session, data);
    return data.challengeId ? 'Challenge updated' : 'Challenge created as a draft';
  });
}
export async function setChallengeStatusAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: challengeStatusSchema, admin: true, revalidate: R }, async ({ tx, session, data }) => {
    await svc.setChallengeStatus(tx, session, data);
    return data.status === 'published' ? 'Challenge published — members notified' : `Challenge ${data.status}`;
  });
}
export async function joinChallengeAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: joinSchema, revalidate: R }, async ({ tx, session, data }) => {
    await svc.joinChallenge(tx, session, data.challengeId);
    return 'You joined the challenge';
  });
}
export async function leaveChallengeAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: joinSchema, revalidate: R }, async ({ tx, session, data }) => {
    await svc.leaveChallenge(tx, session, data.challengeId);
    return 'You left the challenge';
  });
}
export async function submitResultAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: submissionSchema, revalidate: R }, async ({ tx, session, data }) => {
    await svc.submitResult(tx, session, data);
    return 'Result submitted';
  });
}
export async function reviewSubmissionAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: reviewSubmissionSchema, admin: true, revalidate: R }, async ({ tx, session, data }) => {
    await svc.reviewSubmission(tx, session, data);
    return `Submission ${data.decision}`;
  });
}
export async function awardRewardAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: rewardSchema, admin: true, revalidate: R }, async ({ tx, session, data }) => {
    await svc.awardReward(tx, session, data);
    return 'Reward recorded';
  });
}
