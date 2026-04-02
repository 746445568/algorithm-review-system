import { createContext, useContext, useState, useCallback } from "react";

const NavigationContext = createContext(null);

export function NavigationProvider({ children }) {
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [navigationState, setNavigationState] = useState({});

  const navigateTo = useCallback((page, state = {}) => {
    setCurrentPage(page);
    setNavigationState(state);
  }, []);

  const value = {
    page: currentPage,
    navigationState,
    navigateTo,
  };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error("useNavigation must be used within NavigationProvider");
  }
  return context;
}
