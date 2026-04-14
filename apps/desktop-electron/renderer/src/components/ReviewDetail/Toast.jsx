import React, { useEffect } from "react";

export const Toast = React.memo(function Toast({ message, isError, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className={`rd-toast ${isError ? "rd-toast--error" : ""}`}>
      {message}
    </div>
  );
});
