import React from 'react';

/**
 * Starter-kit ConnectionGate.
 *
 * The upstream gate waited for ConnectionManager to reach READY (talking
 * to a real backend) before mounting children, and rendered sign-in /
 * gate screens when auth checks failed. Neither makes sense in a kit
 * that ships without a backend — users of the starter would just see a
 * permanent loading spinner — so this version is a passthrough.
 *
 * When you wire your own backend, replace this with whatever auth /
 * connection gating you actually need.
 */

interface ConnectionGateProps {
  children: React.ReactNode;
}

export const ConnectionGate: React.FC<ConnectionGateProps> = ({ children }) => {
  return <>{children}</>;
};
