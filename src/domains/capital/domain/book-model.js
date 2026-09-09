/**
 * The capital book's vocabulary — the states an investment, its asset and a
 * payment can be in. Pure, so the engines (forecast, metrics, basket) can
 * read it without touching the book's storage.
 */

'use strict';

/** Where an investment has got to. Only `pipeline` is ranked for selection. */
const STATUSES = ['pipeline', 'committed', 'deployed', 'exited', 'declined'];

/**
 * Where the **asset** has got to. A second axis, and deliberately not the one
 * above.
 *
 * `status` is the bank's position: whether the money is committed, out, or
 * recovered. `delivery` is the project's: whether the thing has been built.
 * They move independently — a bank can exit a facility on a plant still under
 * construction, and a completed building can sit on the book for another
 * decade. Folding them into one field would make "completed" mean two things
 * and answer neither question.
 *
 * Three states, not four. An earlier draft carried `operating` beside
 * `completed`, which for a construction facility are the same fact said twice:
 * a building is operating precisely because construction finished. Two labels
 * for one state is how two screens end up disagreeing about the same project.
 * `completed` means built and handed over, whatever the asset does afterwards.
 *
 * It lives on the investment rather than on a GCF pipeline record because the
 * desk shows one row per investment and every financed project has exactly
 * one. Held in both places it would be two fields that can disagree, which is
 * the failure this codebase spends most of its effort avoiding.
 */
const DELIVERY_STATES = ['not_started', 'under_construction', 'completed'];

/** Money has left the institution for these; the others are intentions. */
const DEPLOYING_STATUSES = ['committed', 'deployed', 'exited'];

const PAYMENT_KINDS = ['disbursement', 'repayment', 'fee'];

module.exports = { STATUSES, DELIVERY_STATES, DEPLOYING_STATUSES, PAYMENT_KINDS };
