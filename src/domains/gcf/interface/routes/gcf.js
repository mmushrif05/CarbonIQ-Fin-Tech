// @ts-check
/**
 * The GCF routes, mounted in one place.
 *
 * Split along the four things a reader comes here for — the reference set, the
 * pipeline and its emissions, the disclosure and its transfer package, and the
 * appraisal — because the file had grown past the length this repository holds
 * a source file to, and one 578-line router is four subjects nobody can find.
 */

'use strict';

const { Router } = require('express');

const router = Router();

router.use(require('./gcf/reference'));
router.use(require('./gcf/pipeline'));
router.use(require('./gcf/disclosure'));
router.use(require('./gcf/appraisal'));

module.exports = router;
