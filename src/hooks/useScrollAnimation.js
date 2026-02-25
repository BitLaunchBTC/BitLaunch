import { useEffect } from 'react';

const useScrollAnimation = () => {
    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '-30px 0px'
        });

        // Observe individual elements
        const elements = document.querySelectorAll('.animate-on-scroll');
        elements.forEach(el => observer.observe(el));

        // Auto-stagger children inside .stagger-children containers
        const staggerContainers = document.querySelectorAll('.stagger-children');
        staggerContainers.forEach(container => {
            const children = container.querySelectorAll('.animate-on-scroll');
            children.forEach((child, i) => {
                child.style.transitionDelay = `${i * 0.06}s`;
            });
        });

        return () => {
            elements.forEach(el => observer.unobserve(el));
        };
    }, []);
};

export default useScrollAnimation;
