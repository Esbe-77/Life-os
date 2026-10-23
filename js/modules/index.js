// The app's modules, in tab-bar order. To add a module: write it in this
// folder (see CLAUDE.md for the shape), import it here and add it to MODULES.

import home from "./home.js";
import weeklyReview from "./weekly-review.js";
import decisions from "./decisions.js";
import people from "./people.js";
import energy from "./energy.js";

export const MODULES = [home, energy, people, decisions, weeklyReview];
export const TABS = MODULES;
