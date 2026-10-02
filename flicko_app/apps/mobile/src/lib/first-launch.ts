import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

const INTRO_SEEN = "flicko.intro.seen";

/*
 * True on the first launch (full intro), false afterwards, null while reading storage.
 */
export function useFirstLaunch() {
  const [first, setFirst] = useState<boolean | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(INTRO_SEEN)
      .then((value) => setFirst(value === null))
      .catch(() => setFirst(false));
  }, []);
  return first;
}

export const markIntroSeen = () =>
  AsyncStorage.setItem(INTRO_SEEN, "1").catch(() => {});
