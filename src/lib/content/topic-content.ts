export interface TopicContent {
  title: string;
  description: string;
  intro: string;
  guideIntro?: string[];
}

export const TOPIC_CONTENT: Record<string, TopicContent> = {
  monitors: {
    title: 'Monitor guides: size, height, and viewing distance',
    description:
      'How to choose a monitor setup that fits your desk and your eyes, with the measurements that decide size, height, and distance.',
    intro:
      'Screen size, eye height, and viewing distance decide whether a monitor setup is comfortable, and all three can be measured before you buy. These guides work through the numbers and the trade-offs.',
    guideIntro: [
      'The desk comes before the screen. Measure the depth of your desktop and how far your eyes sit from the screen, because that viewing distance limits the screen size and resolution you can use without leaning in or turning your head. A larger panel needs more distance, and a higher resolution only pays off if text stays readable at the scaling you plan to use.',
      "Next, decide where the top of the screen should sit. Common ergonomic guidance puts it at or slightly below eye level, so measure your seated eye height and compare it with the stand's height range, or plan for a monitor arm on a VESA mount if the stand cannot reach. Check the desk edge and the arm's weight limit before you order one.",
      "Then list what the monitor has to connect to. A single USB-C cable that carries video, data, and charging can replace a dock, but only if your laptop's port supports it and the power rating covers the laptop's draw. The guides here walk through each measurement and explain which specifications matter for office work.",
    ],
  },
  keyboards: {
    title: 'Keyboard guides: switches, noise, and layout',
    description:
      'Pick a keyboard for the room you work in: switch feel, noise, layout, and the desk space it actually needs.',
    intro:
      'A keyboard is the tool you touch most and the one most likely to annoy the people around you. These guides cover switch feel, noise, layout, and the trade-offs between them.',
    guideIntro: [
      'Choosing a keyboard starts with how you type and where you type. Decide whether you want the short travel of a laptop-style board or the deeper travel of a mechanical switch, and whether you prefer a linear, tactile, or clicky feel. If you share a room or take calls, noise matters as much as feel, and some switch and case designs are noticeably louder than others.',
      'Layout comes next. A full-size board puts the number pad within reach but pushes the mouse further from your shoulder, while compact layouts save desk width and move some keys to a function layer. Measure the space you have for the keyboard and mouse together, and list the keys you use every day before you give any of them up.',
      'Then check the connection and the details that matter after purchase: wired or wireless, how many devices it can pair with, how it charges, the keycap material, and whether the switches can be replaced. The guides here explain switch types, noise, and layouts, and how to judge a keyboard for long working days.',
    ],
  },
  audio: {
    title: 'Desk audio guides: headsets, microphones, and speakers',
    description:
      'Calls, focus, and small rooms: how to choose a headset, a desk microphone, or speakers without buying twice.',
    intro:
      'Audio for a home desk is about the room as much as the equipment. These guides cover headsets, desk microphones, and speakers for calls, focus, and shared spaces.',
    guideIntro: [
      'Desk audio starts with the job. Calls need a microphone that picks up your voice and not the room, focused work needs isolation from outside noise, and music needs speakers that suit the size of the space. Decide which of these matters most, because one device rarely does all three well.',
      'For headsets, check comfort over a full workday: weight, clamping force, ear pad material, and whether the microphone has a physical mute control. For microphones, decide between USB and XLR, check the pickup pattern, and measure how close the microphone can sit to your mouth on your desk. For speakers, measure the space beside the monitor and how far away you sit.',
      'Connections matter too. On many devices, Bluetooth audio drops to a lower-quality mode while the headset microphone is in use, and a USB or wired connection avoids that trade-off. The guides here compare headsets, desk microphones, and speakers for calls, focus, and shared rooms, and explain which specifications to check before buying.',
    ],
  },
  'desk-setup': {
    title: 'Desk setup guides: size, height, and cable management',
    description:
      'Build a desk setup that fits your room and your body: desk size, working height, under-desk clearance, and cable management.',
    intro:
      'A desk setup only works when the measurements do: top depth for the screen, clearance for your legs, and a route for the cables. These guides start from the measurement and end at the purchase decision.',
    guideIntro: [
      'A desk setup that lasts begins with three measurements: the depth of the desktop, the clearance under it, and the distance from your eyes to the screen. Depth limits how far back a monitor can sit, clearance limits drawers and leg room, and viewing distance limits screen size. Write these down before you buy anything that sits on or under the desk.',
      "Then plan for change. Decide whether you may add a second monitor, switch from a laptop to a desktop, or move to a sit-stand frame, and leave room in the layout, the power strip, and the cable routing for that step. A setup that only fits today's equipment has to be rebuilt when one part changes.",
      'Cables are the part buyers plan last and notice first. Count the power plugs and data cables, decide where the power strip lives, and choose trays, clips, or sleeves that fit the desk frame you own. The guides here cover desk size, working height, under-desk clearance, and cable management for small rooms.',
    ],
  },
  chairs: {
    title: 'Office chair guides: sizing, support, and ergonomics',
    description:
      'Choose an office chair by seat height, depth, and backrest support, not by marketing, with the standards worth checking.',
    intro:
      'Most office chairs run out of adjustment before they fit the person using them. These guides cover seat height, seat depth, backrest support, and the standards a buyer can check.',
    guideIntro: [
      "A chair fits when its adjustment range covers your body, so the first numbers to find are your own. Measure the height from the floor to the back of your knee while seated, and the depth from the back of your hips to the back of your knee. Compare them with the chair's seat height range and seat depth before you look at anything else.",
      'Then decide which adjustments you will actually use. Lumbar support, armrest height and width, tilt tension, and a seat slider all add cost, and each one only helps if it reaches your position. Armrests that cannot drop below desk height push the chair away from the desk, so check their lowest setting against the height of your desk.',
      'Finally, look at what a listing can prove: the weight rating, the warranty terms, the parts you can replace, and whether the chair is certified to a recognized standard such as those from BIFMA. The guides here explain which features are worth paying for, which rarely change daily comfort, and how to read a specification sheet before you order.',
    ],
  },
  'buying-basics': {
    title: 'Buying basics: how to judge a specification',
    description:
      'The questions to ask before paying: which specification matters, which is marketing, and how to compare two options fairly.',
    intro:
      'A specification sheet is only useful when you know which number decides the outcome. These guides are about judging a product before you buy it, not about a single product.',
  },
  accessories: {
    title: 'Desk accessory guides: docks, stands, and the smaller gear',
    description:
      'The smaller gear that decides how a desk works: docks, laptop stands, webcams, mice, desk pads, and organisers.',
    intro:
      'Accessories are where a desk setup is either finished or cluttered. These guides cover docks, stands, webcams, mice, and the other additions that solve a measurable problem, and the ones that do not.',
    guideIntro: [
      'An accessory is worth buying when it fixes a problem you can name, so start there and measure it: the height of a laptop screen against your eye line, the number of cables you plug in every morning, the free space beside your keyboard, or the light falling on your face during calls.',
      "Then match the specification to that measurement. For docks and hubs, check the host port, the number and type of displays, and the power delivery rating against your laptop's charger. For laptop stands, check the height range, the angle, and whether air can still reach the vents. For mice and desk pads, measure the space you have and the grip that suits your hand.",
      'Check compatibility once more before you order: the cable standards, the operating system support, and the return terms. The guides here cover docks, stands, webcams, mice, laptop cooling, and the other small gear on a desk, and explain which additions solve a measurable problem and which only add clutter.',
    ],
  },
  ergonomics: {
    title: 'Ergonomics guides: posture, height, and comfort',
    description:
      'Sit and stand without strain: working height, reach, posture, and the adjustments that actually change how a desk feels.',
    intro:
      'Ergonomics is arithmetic before it is furniture: heights, distances, and reach decide comfort. These guides cover posture, working height, and the adjustments worth making.',
  },
  'home-office': {
    title: 'Home office guides: small spaces that work',
    description:
      'Working from a small room or a shared space: compact desks, storage, lighting, and noise control that still function.',
    intro:
      'A home office in a small space means every choice does double duty. These guides cover compact desks, storage, lighting, and noise for rooms that are not only offices.',
  },
  laptops: {
    title: 'Laptop guides: performance, battery, and ports',
    description:
      'Work laptops and handheld PCs judged on sustained performance, battery behaviour, and the ports you will actually need day to day.',
    intro:
      'A laptop is a set of compromises between sustained performance, battery life, weight, and ports, and most of them only show up after the first month. These guides and review roundups work through the trade-offs, with every measurement credited to the outlet that took it.',
    guideIntro: [
      'A work laptop is a set of trade-offs, so decide what the machine has to do before comparing models. List the heaviest task you run, how long it runs, and whether you work away from a charger. Performance under a long load can differ from short benchmark results, so look for reviews that test the kind of work you do.',
      'Then check the parts you cannot change later. Memory and storage are soldered on many current laptops, so choose the amount you will need for the life of the machine. Count the ports you use every day, including displays, card readers, and wired networking, and decide whether a dock is acceptable or the laptop must connect on its own.',
      'Weight, screen size, and battery life come last because they depend on how you move. A laptop that stays on a desk can trade battery life for a larger screen, while one that travels needs the opposite. The guides here compare current models and explain which measurements to trust, with each figure credited to the outlet that measured it.',
    ],
  },
  tablets: {
    title: 'Tablet guides: reading, notes, and a second screen',
    description:
      'Tablets and e-readers judged on the reading experience, handwriting latency, and whether they replace a second screen.',
    intro:
      'A tablet earns its place when it does one job well: reading, taking handwritten notes, or holding a reference beside your main screen. These guides cover where each option stops being enough.',
    guideIntro: [
      'A tablet works best when it has one clear job, so decide that job first: reading long documents, taking handwritten notes, sketching, or showing reference material beside a main screen. Each job puts weight on a different part of the hardware, and a model that suits one can be a poor fit for another.',
      'For reading, look at screen type, size, and weight, and decide between an LCD or OLED tablet and an E Ink reader. For notes, check the stylus: whether it is included, how it charges and attaches, and how writing feels on the glass. For a second screen, check whether the tablet can act as an extended display for your computer and which cable or app that needs.',
      'Then check the software limits. File formats, cloud sync, export options, and how long the maker supports updates all affect whether your notes and documents stay usable. The guides here compare tablets and e-readers for reading, handwriting, and desk use, and explain where each option stops being enough.',
    ],
  },
  phones: {
    title: 'Phone guides: chips, batteries, and durability',
    description:
      'Phones and phone hardware judged on what changes in daily use: chips, battery chemistry, cooling, and durability.',
    intro:
      'A phone spec sheet hides the parts that decide daily use: how the chip behaves under sustained load, how the battery ages, and how the hardware holds up. These guides explain those parts with cited sources.',
  },
  'ai-software': {
    title: 'AI and software guides: models, agents, and developer tools',
    description:
      'AI models, AI agents, and developer tools explained: what changed, what it costs, and where it fits in real work.',
    intro:
      'New AI models and tools arrive faster than anyone can evaluate them. These guides explain what a model, agent, or tool actually does, what its makers and independent testers report, and what it costs to use.',
  },
  'standing-desks': {
    title: 'Standing desk guides: height range, travel, and stability',
    description:
      'Choose a standing desk by its height range and how steady it stays at full extension, not by the size of its motor.',
    intro:
      'A standing desk only helps if it reaches your standing elbow height and stays steady there. These guides cover height range, travel, stability, and the presets worth paying for.',
    guideIntro: [
      "A standing desk has to reach two heights: your seated elbow height and your standing elbow height, both measured with your shoulders relaxed. Measure them in the shoes you usually wear, then account for the thickness of the desktop and any keyboard tray. If either number falls outside the frame's height range, no other feature will fix it.",
      'Stability is the next question. A desk can feel solid at sitting height and sway at full extension, especially with a deep monitor arm or a heavy load at one edge. Compare the frame type, the crossbar, the number of leg stages, and the rated lifting capacity with the total weight you plan to put on it.',
      'Small rooms add their own limits: the footprint of the legs, the clearance for a chair and drawers, and the slack every cable needs when the desk rises. The guides here cover height range, travel, stability, memory presets, and how to fit a sit-stand desk into a small home office without blocking a door or a window.',
    ],
  },
  'data-storage': {
    title: 'Data storage guides: SSDs, drives, and backup',
    description:
      'Pick storage by interface, sustained speed, and whether the backup actually restores, not by headline capacity.',
    intro:
      'Storage decisions turn on interfaces, sustained speeds, and recovery rather than the largest number on the box. These guides cover SSDs, external drives, and backup you can restore from.',
  },
  networking: {
    title: 'Home office networking guides: routers and mesh',
    description:
      'Coverage, wired backhaul, and the settings that decide whether a video call survives a busy evening.',
    intro:
      'Most home office network problems are coverage and contention problems, not speed problems. These guides cover routers, mesh systems, wired backhaul, and keeping calls stable.',
  },
  printers: {
    title: 'Printer guides: cost per page and running costs',
    description:
      'Printers judged on cost per page, cartridge behaviour, and what happens when you only print twice a month.',
    intro:
      'The purchase price of a printer says very little about what it costs to own. These guides cover cost per page, cartridge and toner behaviour, and printers that survive irregular use.',
  },
  'meeting-gear': {
    title: 'Meeting gear guides: webcams and call lighting',
    description:
      'Look right on a video call: sensor size, field of view, mounting height, and lighting that does not fight your screen.',
    intro:
      'A video call looks right when the framing and the light are right, and both are geometry problems before they are hardware problems. These guides cover webcams, fields of view, mounting height, and call lighting.',
  },
  lighting: {
    title: 'Desk lighting guides: task light and eye strain',
    description:
      'Match task and ambient light to the screen to cut glare and eye strain, with the measurements that matter.',
    intro:
      'Lighting decides whether a screen is comfortable to look at. These guides cover task light, ambient light, glare, and how to measure brightness rather than guess it.',
    guideIntro: [
      'Desk lighting has two jobs: lighting the work surface and keeping the screen comfortable to read. Start by noting where your windows are, when daylight reaches the desk, and whether light falls on the screen or behind it. Glare on the panel and strong contrast between a bright screen and a dark room are common sources of discomfort.',
      'Then decide what kind of light you need. A task lamp lights the desk surface, a monitor light bar lights the area in front of the screen without hitting the panel, and ambient light reduces the contrast with the rest of the room. Check the brightness in lumens or lux, the color temperature range, and whether the light dims smoothly.',
      'Color rendering and flicker matter if you work with color or spend long hours under the light, so look for a stated CRI value and a clear statement about flicker. The guides here cover task lights, light bars, and ambient light, and how to measure brightness at the desk rather than guess it.',
    ],
  },
  storage: {
    title: 'Desk storage guides: drawers, trays, and clearance',
    description:
      'Under-desk storage that fits: clearance, drawer travel, materials, and the pulls that survive daily use.',
    intro:
      'Storage only works when it fits the gap you have. These guides cover under-desk clearance, drawer travel, materials, and the small choices that decide whether it lasts.',
  },
  'buying-guide': {
    title: 'Buying guides: what to check before you pay',
    description:
      'Research-grounded buying guides for the tools you work with, written from primary sources and checked before publishing.',
    intro:
      'These guides answer a specific buying question with checkable detail: standards, measurements, compatibility, and the trade-offs behind each recommendation.',
  },
  'cable-management': {
    title: 'Cable management guides: trays, clips, and routing',
    description:
      'Route and hide desk cables without drilling: trays, clips, sleeves, and the clearances that decide what fits.',
    intro:
      'Cable management is a routing problem before it is a product. These guides cover trays, clips, sleeves, and the clearances that decide what fits under a desk.',
  },
  'desk-accessories': {
    title: 'Desk accessories: the small things that matter',
    description:
      'The accessories that earn their space on a small desk, and the ones that only add clutter.',
    intro:
      'On a small desk, every accessory costs space. These guides cover the additions that solve a real problem and the ones that only look tidy.',
  },
};
