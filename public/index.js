import { ClerkUI } from "./ClerkUI.js";
import { UI_BRAND } from "./internal/index.js";

//#region src/index.ts
/**
* UI object for Clerk UI components.
* Pass this to ClerkProvider to use the bundled UI.
*
* @example
* ```tsx
* import { ui } from '@clerk/ui';
*
* <ClerkProvider ui={ui}>
*   ...
* </ClerkProvider>
* ```
*/
const ui = {
	__brand: UI_BRAND,
	version: "1.0.1",
	ClerkUI
};

//#endregion
export { ui };
//# sourceMappingURL=index.js.map