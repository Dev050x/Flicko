import { setDefaultResultOrder } from "node:dns";
import { setDefaultAutoSelectFamilyAttemptTimeout } from "node:net";

setDefaultResultOrder("ipv4first");
setDefaultAutoSelectFamilyAttemptTimeout(5_000);
