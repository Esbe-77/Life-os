// The app's modules, in tab-bar order. To add a module: write it in this
// folder (see CLAUDE.md for the shape), import it here and add it to MODULES.

import home from "./home.js";
import weeklyReview from "./weekly-review.js";
import decisions from "./decisions.js";
import people from "./people.js";
import energy from "./energy.js";
import mind from "./mind.js";
import goals from "./goals.js";

// Energy is no longer a tab, but stays here so its old check-ins are kept in
// backups and can still be restored.
export const MODULES = [home, goals, mind, people, decisions, weeklyReview, energy];
export const TABS = MODULES.filter(m => m !== energy);
