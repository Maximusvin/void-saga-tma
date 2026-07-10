# Ironroot Marauder: authoring source

`ironroot-rig-source.ora` є єдиним authoring source для багатошарового rig. Він містить 21 незалежний component layer і прихований approved master для звірки силуету. Runtime assets генеруються в `public/assets/rift/ironroot-rig/`; проміжні chroma-key PNG у репо не зберігаються.

## Image generation

Інструмент: вбудований `imagegen`, режим нового растрового зображення з чинним `ironroot-marauder.webp` як identity reference.

Master-art prompt:

```text
Create a production-quality full-body 2D game enemy master for Ironroot Marauder, preserving the exact identity of the supplied stone-and-moss giant: horned stone head, long root beard, asymmetrical rune-carved shoulder plates, amber chest rune, cyan crystal right gauntlet, massive hands and feet. Neutral front-facing rig-ready stance with arms slightly separated from the torso and both legs clearly readable. Paint hidden overlap beneath joints so the figure can be articulated without gaps. Crisp mobile-game rendering, coherent lighting, hard stone forms, fine moss edges, no rubber deformation, no text, no frame, no shadow. Uniform flat chroma magenta background #ff00ff, no magenta on the character.
```

Parts-sheet prompt:

```text
Using the approved Ironroot Marauder master as the exact identity reference, create a clean exploded rig-parts sheet on uniform flat #ff00ff. Include 21 separate non-touching components with generous padding: back crystals, torso, head, neck beard, pelvis, left shoulder, left upper arm, left forearm, left hand, right shoulder, right upper arm, right forearm, right crystal hand, three moss strands, chest glow, left thigh, right thigh, left shin and foot, right shin and foot. Every hard part keeps its original proportions, lighting and painted texture; hidden joint overlap is fully painted. No labels, numbers, guides, shadows, duplicate parts or magenta contamination.
```

Після генерації chroma-key видаляється офіційним `remove_chroma_key.py`, краї перевіряються на 200%, а шари пакуються в `.ora` і два runtime atlases.
