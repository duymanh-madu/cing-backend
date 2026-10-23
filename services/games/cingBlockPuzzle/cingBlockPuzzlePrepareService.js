const { resolveAuthenticatedUserId } = require('./cingBlockPuzzleSessionService');
const { getSessionForSubmission } = require('./repositories/cingBlockPuzzleSessionRepository');
const { normalizeSubmissionRequest, normalizeSubmissionSessionRow } = require('./domain/cingBlockPuzzleSubmissionContracts');
const { verifyReplayAuthority } = require('./domain/cingBlockPuzzleReplayAuthority');
async function prepareGameplayDecision({ customer, sessionId, body }) {
  const userId = resolveAuthenticatedUserId(customer);
  const request = normalizeSubmissionRequest({sessionId, body});
  const raw = await getSessionForSubmission(request.session_id);
  if (!raw) throw Object.assign(new Error('Không tìm thấy ván chơi'), {code:'BLOCK_PUZZLE_SESSION_NOT_FOUND',statusCode:404});
  const session = normalizeSubmissionSessionRow(raw);
  if (session.user_id !== userId) throw Object.assign(new Error('Phiên không thuộc tài khoản'), {code:'BLOCK_PUZZLE_SESSION_OWNERSHIP_MISMATCH',statusCode:403});
  if (session.status !== 'active' || Date.now() >= Date.parse(session.expires_at)) {
    throw Object.assign(new Error('Phiên không còn hoạt động'), {code:'BLOCK_PUZZLE_SESSION_EXPIRED',statusCode:409});
  }
  await verifyReplayAuthority({transcript:request.replay,expectedSeed:session.seed,
    engineVersion:session.engine_version,rulesVersion:session.rules_version,
    scoreVersion:session.score_version,replayVersion:session.replay_version,requireEnded:true});
  // No receipt, no score publication, no credit change. Later POST still reloads
  // ownership/session and commits under the existing atomic SQL checks.
  return {prepared:true};
}
module.exports = { prepareGameplayDecision };
