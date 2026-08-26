import { crmEntities } from "./crm/index.js";
import { projectEntities } from "./projects/index.js";

export * from "./crm/index.js";
export * from "./projects/index.js";

export const allEntities = [...crmEntities, ...projectEntities];
