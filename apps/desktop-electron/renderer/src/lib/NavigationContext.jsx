import { createContext, useCallback, useContext, useState } from "react";

const NavigationContext = createContext(null);

export function NavigationProvider({ children, initialPage = "dashboard" }) {
  const [page, setPage] = useState(initialPage);
  const [navigationState, setNavigationState] = useState({});

  const navigateTo = useCallback((nextPage, state = {}) => {
    setNavigationState(state);
    setPage(nextPage);
  }, []);

  return (
    <NavigationContext.Provider value={{ page, navigationState, navigateTo, setPage }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("useNavigation must be used within NavigationProvider");
  return ctx;
}
