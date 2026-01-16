console.clear(); // Start with a clean console on refesh

const slider = document.querySelector(".slider");
const items = gsap.utils.toArray(".item");
const offset = 30;


function moveCard() {
  const lastItem = slider.querySelector(".item:last-child");

  if (slider && lastItem) {
    lastItem.style.display = "none"; // Hide the last item
    const newItem = document.createElement("img");
    newItem.className = lastItem.className; // Set the same class name
    newItem.src = lastItem.src; // Set the same class name
    slider.insertBefore(newItem, slider.firstChild); // Insert the new item at the beginning of the slider
  }
}

document.body.addEventListener("click", (e) => {
  let state = Flip.getState(".item");

  moveCard();

  Flip.from(state, {
    targets: ".item",
    ease: "sine.inOut",
    absolute: true,
    onEnter: (elements) => {
      return gsap.from(elements, {
        duration: 0.3,
        yPercent: 20,
        opacity: 0,
        ease: "expo.out"
      });
    },
    onLeave: (element) => {
      return gsap.to(element, {
        duration: 0.3,
        yPercent: 5,
        xPercent: -5,
        transformOrigin: "bottom left",
        opacity: 0,
        ease: "expo.out",
        onComplete () {
          console.log("logging", element[0])
          slider.removeChild(element[0]);
        }
      });
    }
  });
});
