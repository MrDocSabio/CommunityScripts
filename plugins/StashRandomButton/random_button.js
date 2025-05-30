(function() {
  'use strict';

  // Helper: get plural for GraphQL entities
  function getPlural(entity) {
    return (entity === "Gallery") ? "Galleries"
      : (entity === "Tag") ? "Tags"
      : (entity === "Image") ? "Images"
      : (entity === "Scene") ? "Scenes"
      : (entity === "Performer") ? "Performers"
      : (entity === "Studio") ? "Studios"
      : (entity === "Group") ? "Groups"
      : entity + "s";
  }

  function getRandomSeed() {
    return Math.floor(Math.random() * 10000000);
  }

  function getCurrentFilters() {
    return new URLSearchParams(window.location.search);
  }

  // Main Smart Random function
  async function smartRandom() {
    const path = window.location.pathname;
    const params = getCurrentFilters();

    // 1. If on /scenes/markers: pick a random marker and jump to its time in the scene
    if (/^\/scenes\/markers/.test(path)) {
      let allMarkers = [];
      let page = 1, perPage = 1000, total = 0;
      do {
        const query = `
          query FindSceneMarkers($filter: FindFilterType) {
            findSceneMarkers(filter: $filter) {
              count
              scene_markers {
                id
                scene { id }
                seconds
              }
            }
          }
        `;
        const variables = { filter: { page, per_page: perPage } };
        let resp = await fetch('/graphql', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables })
        });
        let data = await resp.json();
        if (data.errors) { alert("Error: " + JSON.stringify(data.errors)); return; }
        let markers = data.data.findSceneMarkers.scene_markers;
        total = data.data.findSceneMarkers.count;
        allMarkers.push(...markers);
        page++;
      } while (allMarkers.length < total);

      if (!allMarkers.length) { alert("No markers found."); return; }
      const marker = allMarkers[Math.floor(Math.random() * allMarkers.length)];
      if (!marker.scene) { alert("Marker has no scene."); return; }
      window.location.href = `/scenes/${marker.scene.id}?t=${Math.floor(marker.seconds)}`;
      return;
    }

    // 2. If in a scene or image detail: go to a new random scene/image (with playlist)
    if (/^\/scenes\/\d+$/.test(path))   return randomGlobal('Scene', 'scenes', '/scenes/');
    if (/^\/images\/\d+$/.test(path))   return randomGlobal('Image', 'images', '/images/');

    // 3. If on performer detail or scenes: random scene from this performer, and playlist only of this performer
    const performerMatch = path.match(/^\/performers\/(\d+)(?:\/scenes)?$/);
    if (performerMatch)
      // This makes the playlist only from this performer (just like StashApp's native "Play random" dropdown)
      return randomFilteredPlaylist('Scene', 'scenes', '/scenes/', { performers: { value: [performerMatch[1]], modifier: "INCLUDES_ALL" } }, 'performer_id', performerMatch[1]);

    // 4. If on studio detail or scenes: random scene from this studio, and playlist only of this studio
    const studioMatch = path.match(/^\/studios\/(\d+)(?:\/scenes)?$/);
    if (studioMatch)
      return randomFilteredPlaylist('Scene', 'scenes', '/scenes/', { studios: { value: [studioMatch[1]], modifier: "INCLUDES_ALL" } }, 'studio_id', studioMatch[1]);

    // 5. If on group detail or scenes: random scene from this group, and playlist only of this group
    const groupMatch = path.match(/^\/groups\/(\d+)(?:\/scenes)?$/);
    if (groupMatch)
      return randomFilteredPlaylist('Scene', 'scenes', '/scenes/', { groups: { value: [groupMatch[1]], modifier: "INCLUDES_ALL" } }, 'group_id', groupMatch[1]);

    // 6. If on tag detail or scenes: random scene from this tag, and playlist only of this tag
    const tagMatch = path.match(/^\/tags\/(\d+)(?:\/scenes)?$/);
    if (tagMatch)
      return randomFilteredPlaylist('Scene', 'scenes', '/scenes/', { tags: { value: [tagMatch[1]], modifier: "INCLUDES_ALL" } }, 'tag_id', tagMatch[1]);

    // 7. If on gallery detail: random image from this gallery
    const galleryDetail = path.match(/^\/galleries\/(\d+)$/);
    if (galleryDetail)
      return randomFiltered('Image', 'images', '/images/', { galleries: { value: [galleryDetail[1]], modifier: "INCLUDES_ALL" } });

    // 8. If on group galleries tab: random gallery from this group
    const groupGalleries = path.match(/^\/groups\/(\d+)\/galleries/);
    if (groupGalleries)
      return randomFiltered('Gallery', 'galleries', '/galleries/', { groups: { value: [groupGalleries[1]], modifier: "INCLUDES_ALL" } });

    // 9. Root pages (performers, studios, tags, groups, galleries, images, scenes): random global entity
    if (/^\/performers(\/)?$/.test(path)) return randomGlobal('Performer', 'performers', '/performers/');
    if (/^\/studios(\/)?$/.test(path))    return randomGlobal('Studio', 'studios', '/studios/');
    if (/^\/tags(\/)?$/.test(path))       return randomGlobal('Tag', 'tags', '/tags/');
    if (/^\/groups(\/)?$/.test(path))     return randomGlobal('Group', 'groups', '/groups/');
    if (/^\/galleries(\/)?$/.test(path))  return randomGlobal('Gallery', 'galleries', '/galleries/');
    if (/^\/images(\/)?$/.test(path))     return randomGlobal('Image', 'images', '/images/');
    if (/^\/scenes(\/)?$/.test(path))     return randomGlobal('Scene', 'scenes', '/scenes/');

    // 10. Fallback: global random scene
    return randomGlobal('Scene', 'scenes', '/scenes/');
  }

  // Special random for performer, studio, group, tag: playlist only contains that entity (like StashApp native)
  async function randomFilteredPlaylist(entity, idField, redirectPrefix, internalFilter, filterKey, filterValue) {
    const qsort = `random_${getRandomSeed()}`;
    const qsortd = 'desc';
    const per_page = 40;
    let filter = { per_page: 1 };
    let variables = { filter };
    let filterArg = "";
    let filterVar = "";

    if (internalFilter) {
      filterArg = `, $internal_filter: ${entity}FilterType`;
      filterVar = `, ${entity.toLowerCase()}_filter: $internal_filter`;
      variables.internal_filter = internalFilter;
    }

    // 1. Query total count for the entity
    const countQuery = `
      query Find${getPlural(entity)}($filter: FindFilterType${filterArg}) {
        find${getPlural(entity)}(filter: $filter${filterVar}) { count }
      }
    `;
    let countResp = await fetch('/graphql', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: countQuery, variables })
    });
    let countData = await countResp.json();
    if (countData.errors) { alert("Error: " + JSON.stringify(countData.errors)); return; }
    const totalCount = countData.data[`find${getPlural(entity)}`].count;
    if (!totalCount) { alert("No results found."); return; }

    // 2. Choose a random page
    const totalPages = Math.ceil(totalCount / per_page);
    const randomPage = Math.floor(Math.random() * totalPages) + 1;

    let itemVars = { filter: { per_page, page: randomPage, sort: qsort, direction: qsortd.toUpperCase() } };
    if (internalFilter) itemVars.internal_filter = internalFilter;
    const itemQuery = `
      query Find${getPlural(entity)}($filter: FindFilterType${filterArg}) {
        find${getPlural(entity)}(filter: $filter${filterVar}) { ${idField} { id } }
      }
    `;
    let itemResp = await fetch('/graphql', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: itemQuery, variables: itemVars })
    });
    let itemData = await itemResp.json();
    if (itemData.errors) { alert("Error: " + JSON.stringify(itemData.errors)); return; }
    const arr = itemData.data[`find${getPlural(entity)}`][idField];
    if (!arr || arr.length === 0) { alert("No results found."); return; }
    const randomIndex = Math.floor(Math.random() * arr.length);
    const id = arr[randomIndex].id;

    // 3. Add the entity filter to the playlist querystring so only scenes from that entity appear in playlist
    let params = new URLSearchParams();
    params.set('qsort', qsort);
    params.set('qsortd', qsortd);
    params.set('qfp', randomPage);
    params.set(filterKey, filterValue);

    window.location.href = `${redirectPrefix}${id}?${params.toString()}`;
  }

  // Standard filtered random (used for images/galleries/etc)
  async function randomFiltered(entity, idField, redirectPrefix, internalFilter) {
    const qsort = `random_${getRandomSeed()}`;
    const qsortd = 'desc';
    const per_page = 40;
    let filter = { per_page: 1 };
    let variables = { filter };
    let filterArg = "";
    let filterVar = "";

    if (internalFilter) {
      filterArg = `, $internal_filter: ${entity}FilterType`;
      filterVar = `, ${entity.toLowerCase()}_filter: $internal_filter`;
      variables.internal_filter = internalFilter;
    }

    // 1. Query total count
    const countQuery = `
      query Find${getPlural(entity)}($filter: FindFilterType${filterArg}) {
        find${getPlural(entity)}(filter: $filter${filterVar}) { count }
      }
    `;
    let countResp = await fetch('/graphql', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: countQuery, variables })
    });
    let countData = await countResp.json();
    if (countData.errors) { alert("Error: " + JSON.stringify(countData.errors)); return; }
    const totalCount = countData.data[`find${getPlural(entity)}`].count;
    if (!totalCount) { alert("No results found."); return; }

    // 2. Random page/position
    const totalPages = Math.ceil(totalCount / per_page);
    const randomPage = Math.floor(Math.random() * totalPages) + 1;

    let itemVars = { filter: { per_page, page: randomPage, sort: qsort, direction: qsortd.toUpperCase() } };
    if (internalFilter) itemVars.internal_filter = internalFilter;
    const itemQuery = `
      query Find${getPlural(entity)}($filter: FindFilterType${filterArg}) {
        find${getPlural(entity)}(filter: $filter${filterVar}) { ${idField} { id } }
      }
    `;
    let itemResp = await fetch('/graphql', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: itemQuery, variables: itemVars })
    });
    let itemData = await itemResp.json();
    if (itemData.errors) { alert("Error: " + JSON.stringify(itemData.errors)); return; }
    const arr = itemData.data[`find${getPlural(entity)}`][idField];
    if (!arr || arr.length === 0) { alert("No results found."); return; }
    const randomIndex = Math.floor(Math.random() * arr.length);
    const id = arr[randomIndex].id;

    // 3. Redirect with playlist (entity filter not included here)
    let params = new URLSearchParams();
    params.set('qsort', qsort);
    params.set('qsortd', qsortd);
    params.set('qfp', randomPage);

    window.location.href = `${redirectPrefix}${id}?${params.toString()}`;
  }

  // Global random (all entities, all filters)
  async function randomGlobal(entity, idField, redirectPrefix) {
    const qsort = `random_${getRandomSeed()}`;
    const qsortd = 'desc';
    const params = getCurrentFilters();
    params.set('qsort', qsort);
    params.set('qsortd', qsortd);

    const per_page = parseInt(params.get('per_page')) || 40;
    let filter = {};
    if (params.has('q')) filter.q = params.get('q');

    // 1. Query total count with filters
    const countQuery = `
      query Find${getPlural(entity)}($filter: FindFilterType) {
        find${getPlural(entity)}(filter: $filter) { count }
      }
    `;
    const countVariables = { filter: filter };
    let countResp = await fetch('/graphql', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: countQuery, variables: countVariables })
    });
    let countData = await countResp.json();
    if (countData.errors) { alert("Error: " + JSON.stringify(countData.errors)); return; }
    const totalCount = countData.data[`find${getPlural(entity)}`].count;
    if (!totalCount) { alert("No results found."); return; }

    // 2. Get a random page/position
    const totalPages = Math.ceil(totalCount / per_page);
    const randomPage = Math.floor(Math.random() * totalPages) + 1;
    params.set('qfp', randomPage);

    // 3. Query the random page for entity IDs
    const itemQuery = `
      query Find${getPlural(entity)}($filter: FindFilterType) {
        find${getPlural(entity)}(filter: $filter) {
          ${idField} { id }
        }
      }
    `;
    const itemVariables = {
      filter: Object.assign({}, filter, {
        page: randomPage,
        per_page: per_page,
        sort: qsort,
        direction: qsortd.toUpperCase()
      })
    };
    let itemResp = await fetch('/graphql', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: itemQuery, variables: itemVariables })
    });
    let itemData = await itemResp.json();
    if (itemData.errors) { alert("Error: " + JSON.stringify(itemData.errors)); return; }
    const arr = itemData.data[`find${getPlural(entity)}`][idField];
    if (!arr || arr.length === 0) { alert("No results found."); return; }
    const randomIndex = Math.floor(Math.random() * arr.length);
    const id = arr[randomIndex].id;

    // 4. Redirect to detail page with playlist params (all scenes, all filters)
    window.location.href = `${redirectPrefix}${id}?${params.toString()}`;
  }

  // Add the Random button to the navbar if not already present
  function addRandomButton() {
    if (document.querySelector('.random-btn')) return;
    const navContainer = document.querySelector('.navbar-buttons.flex-row.ml-auto.order-xl-2.navbar-nav');
    if (!navContainer) return;

    const randomButtonContainer = document.createElement('div');
    randomButtonContainer.className = 'mr-2';
    randomButtonContainer.innerHTML = `
      <a href="javascript:void(0)">
        <button type="button" class="btn btn-primary random-btn" style="display: inline-block !important; visibility: visible !important;">
          Random
        </button>
      </a>
    `;
    randomButtonContainer.querySelector('button').addEventListener('click', smartRandom);
    navContainer.appendChild(randomButtonContainer);
  }

  // Observers to re-add the button when navigation happens
  window.addEventListener('load', () => addRandomButton());
  document.addEventListener('click', (event) => {
    const target = event.target.closest('a');
    if (target && target.href) setTimeout(() => addRandomButton(), 1500);
  });
  window.addEventListener('popstate', () => setTimeout(() => addRandomButton(), 1500));
  window.addEventListener('hashchange', () => setTimeout(() => addRandomButton(), 1500));

  // MutationObserver for navbar changes
  const navContainer = document.querySelector('.navbar-buttons.flex-row.ml-auto.order-xl-2.navbar-nav');
  if (navContainer) {
    const observer = new MutationObserver(() => {
      if (!document.querySelector('.random-btn')) addRandomButton();
    });
    observer.observe(navContainer, { childList: true, subtree: true });
  }

  let intervalAttempts = 0;
  setInterval(() => {
    intervalAttempts++;
    addRandomButton();
  }, intervalAttempts < 60 ? 500 : 2000);

})();
