// @ts-check
/**
 * The Part C registry routes, mounted in one place.
 *
 * Split along what a reader comes here for — the book, the bills of quantities,
 * the assessments, and the position published from them — because the file had
 * grown past the length this repository holds a source file to.
 */

'use strict';

const { Router } = require('express');

const router = Router();

router.use(require('./partc-registry/book'));
router.use(require('./partc-registry/boq'));
router.use(require('./partc-registry/assessments'));
router.use(require('./partc-registry/portfolio'));

module.exports = router;
