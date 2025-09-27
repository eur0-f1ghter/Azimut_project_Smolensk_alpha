document.addEventListener("DOMContentLoaded", function () {
    const slides = document.querySelectorAll(".doc_card");
    const dotsContainer = document.querySelector(".slider-dots");
    let currentSlide = 0;
    let startX = 0;

    // Создание точек
    slides.forEach((_, i) => {
        const dot = document.createElement("span");
        dot.classList.toggle("active", i === 0);
        dot.addEventListener("click", () => goToSlide(i));
        dotsContainer.appendChild(dot);
    });

    function goToSlide(index) {
        if (index < 0) index = slides.length - 1;
        if (index >= slides.length) index = 0;

        slides.forEach((slide, i) => {
            slide.classList.toggle("active", i === index);
            dotsContainer.children[i].classList.toggle("active", i === index);
        });
        currentSlide = index;
    }

    // Обработка свайпа
    const slider = document.querySelector(".doc_card_container");

    slider.addEventListener("touchstart", (e) => {
        startX = e.touches[0].clientX;
    });

    slider.addEventListener("touchend", (e) => {
        const endX = e.changedTouches[0].clientX;
        const deltaX = endX - startX;

        if (Math.abs(deltaX) > 50) {
            if (deltaX < 0) {
                goToSlide(currentSlide + 1); // свайп влево
                slider.style.animation = 'burgerAnimationOpen 0.4s forwards';
            } else {
                goToSlide(currentSlide - 1); // свайп вправо
            }
        }
    });

    // Инициализация
    goToSlide(0);
});