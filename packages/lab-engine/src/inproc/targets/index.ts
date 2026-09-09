import type { TargetBuilder } from '../target.js';
import { vaultBuilder } from './vault.js';
import { injectionBuilder } from './injection.js';
import { footholdBuilder } from './foothold.js';
import { helpdeskBuilder } from './helpdesk.js';

/**
 * The target registry.
 *
 * Adding a lab world is: write a `LabTarget`, export a `TargetBuilder`, and add
 * it here. A `LabSpec` in the curriculum then references it by `builderId`, and
 * the integrity checker guarantees the two stay in sync.
 */
export const ALL_BUILDERS: readonly TargetBuilder[] = [vaultBuilder, injectionBuilder, footholdBuilder, helpdeskBuilder];

export { vaultBuilder, injectionBuilder, footholdBuilder, helpdeskBuilder };
