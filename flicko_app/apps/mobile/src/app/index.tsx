import { Redirect } from "expo-router";

import { useSession } from "@/store/session";

/*
 * Entry point of the navigation gate:
 * no session and not a guest → welcome; session but onboarding not done → profile;
 * otherwise → the camera home.
 */
export default function Index() {
  const { session, isGuest, onboardingDone } = useSession();
  if (!session && !isGuest) return <Redirect href="/welcome" />;
  if (session && !onboardingDone) return <Redirect href="/profile" />;
  return <Redirect href="/camera" />;
}
