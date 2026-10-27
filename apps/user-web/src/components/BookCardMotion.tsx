import { type ReactNode } from "react";
import { motion } from "framer-motion";
import styles from "./BookCard.module.css";

/** A stable container providing staggered entrance animation, smooth positioning, and hover elevation. */
export function BookCardMotion({
  children,
  index = 0,
}: {
  children: ReactNode;
  index?: number;
}) {
  return (
    <motion.div
      className={styles.motionFrame}
      initial={{ opacity: 0, y: 22, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{
        duration: 0.38,
        delay: Math.min(index * 0.04, 0.36),
        ease: [0.16, 1, 0.3, 1],
      }}
      layout="position"
    >
      {children}
    </motion.div>
  );
}

