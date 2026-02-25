import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Animated number counter hook.
 * @param {number} endValue - Target value to count up to
 * @param {number} duration - Animation duration in ms (default 1600)
 * @param {boolean} startOnVisible - Only start when element is visible (default true)
 * @returns {{ value: number, ref: React.RefObject }}
 */
const useCountUp = (endValue, duration = 1600, startOnVisible = true) => {
    const [value, setValue] = useState(0);
    const ref = useRef(null);
    const hasStarted = useRef(false);

    const animate = useCallback(() => {
        if (hasStarted.current) return;
        hasStarted.current = true;

        const start = performance.now();
        const end = endValue;

        const step = (now) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);

            // Ease-out cubic for smooth deceleration
            const eased = 1 - Math.pow(1 - progress, 3);
            setValue(Math.round(eased * end));

            if (progress < 1) {
                requestAnimationFrame(step);
            }
        };

        requestAnimationFrame(step);
    }, [endValue, duration]);

    useEffect(() => {
        if (!startOnVisible) {
            animate();
            return;
        }

        const el = ref.current;
        if (!el) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    animate();
                    observer.disconnect();
                }
            },
            { threshold: 0.3 }
        );

        observer.observe(el);
        return () => observer.disconnect();
    }, [animate, startOnVisible]);

    // Reset if endValue changes
    useEffect(() => {
        hasStarted.current = false;
        setValue(0);
    }, [endValue]);

    return { value, ref };
};

export default useCountUp;
