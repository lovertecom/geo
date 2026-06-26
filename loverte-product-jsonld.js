(function () {
  var productId = "loverte-product-jsonld";
  var breadcrumbId = "loverte-breadcrumb-jsonld";
  var path = location.pathname;
  var existingProduct = document.getElementById(productId);
  var existingBreadcrumb = document.getElementById(breadcrumbId);
  var match = path.match(/^\/(et|lv|lt|fi|en|ru)\/([^/?#]+)\/?$/);

  if (!match) {
    if (existingProduct) existingProduct.remove();
    if (existingBreadcrumb) existingBreadcrumb.remove();
    window.__loverteProductSchemaPath = null;
    return;
  }

  if (existingProduct && existingProduct.getAttribute("data-path") === path) return;
  if (window.__loverteProductSchemaPath === path) return;

  window.__loverteProductSchemaPath = path;
  if (existingProduct) existingProduct.remove();
  if (existingBreadcrumb) existingBreadcrumb.remove();

  var lang = match[1];
  var urlKey = decodeURIComponent(match[2]);

  var query = 'query ProductSchema($key:String!){products(filter:{url_key:{eq:$key}}){items{sku name ean_code meta_description description{html} short_description{html} image{url label} media_gallery{url label disabled} product_unit_price product_contents application review_count rating_summary reviews(pageSize:3){items{nickname summary text average_rating created_at}} categories{name url_path breadcrumbs{category_name category_url_path}} price_range{minimum_price{final_price{value currency} regular_price{value currency}}} stock_status ... on ConfigurableProduct{variants{product{sku name stock_status price_range{minimum_price{final_price{value currency} regular_price{value currency}}}}}}}}}';

  function text(html) {
    var div = document.createElement("div");
    div.innerHTML = html || "";
    return div.textContent.replace(/\s+/g, " ").trim();
  }

  function availability(status) {
    return status === "IN_STOCK"
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock";
  }

  function ratingFromPercent(value) {
    var number = Number(value);
    if (!number) return null;
    return String(Math.round((number / 20) * 10) / 10);
  }

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function addScript(id, data, pathValue) {
    var script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = id;
    script.setAttribute("data-path", pathValue);
    script.text = JSON.stringify(data);
    document.head.appendChild(script);
  }

  function offerFromProduct(p) {
    var price = p.price_range.minimum_price.final_price;
    return {
      "@type": "Offer",
      "url": location.origin + location.pathname,
      "sku": p.sku,
      "name": p.name,
      "price": String(price.value),
      "priceCurrency": price.currency,
      "availability": availability(p.stock_status),
      "itemCondition": "https://schema.org/NewCondition",
      "seller": { "@type": "Organization", "name": "LOVERTE" }
    };
  }

  function brandFromCategories(categories) {
    for (var i = 0; i < (categories || []).length; i++) {
      var category = categories[i];
      if (category.url_path && category.url_path.indexOf("kaubamargid/") === 0) {
        return clean(category.name);
      }
    }
    return null;
  }

  function primaryCategory(categories) {
    var excluded = /^(kaubamargid|weekly-top-main|eripakkumised)\b/;

    for (var i = 0; i < (categories || []).length; i++) {
      var category = categories[i];
      if (
        category.url_path &&
        category.breadcrumbs &&
        category.breadcrumbs.length &&
        !excluded.test(category.url_path)
      ) {
        return category;
      }
    }

    return null;
  }

  function breadcrumbSchema(category, productName) {
    if (!category) return null;

    var items = [{
      "@type": "ListItem",
      "position": 1,
      "name": "LOVERTE",
      "item": location.origin + "/" + lang
    }];

    (category.breadcrumbs || []).forEach(function (crumb) {
      items.push({
        "@type": "ListItem",
        "position": items.length + 1,
        "name": clean(crumb.category_name),
        "item": location.origin + "/" + lang + "/" + crumb.category_url_path
      });
    });

    items.push({
      "@type": "ListItem",
      "position": items.length + 1,
      "name": clean(category.name),
      "item": location.origin + "/" + lang + "/" + category.url_path
    });

    items.push({
      "@type": "ListItem",
      "position": items.length + 1,
      "name": productName,
      "item": location.origin + location.pathname
    });

    return {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": items
    };
  }

  fetch("/graphql", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      "Store": lang
    },
    body: JSON.stringify({ query: query, variables: { key: urlKey } })
  })
    .then(function (res) { return res.json(); })
    .then(function (json) {
      var item = json && json.data && json.data.products && json.data.products.items[0];

      if (!item || !item.name || !item.sku) {
        window.__loverteProductSchemaPath = null;
        return;
      }

      var offers = item.variants && item.variants.length
        ? item.variants.map(function (v) { return offerFromProduct(v.product); })
        : [offerFromProduct(item)];

      var images = [];
      if (item.image && item.image.url) images.push(item.image.url);

      (item.media_gallery || []).forEach(function (image) {
        if (!image.disabled && image.url && images.indexOf(image.url) === -1) {
          images.push(image.url);
        }
      });

      var category = primaryCategory(item.categories);
      var brand = brandFromCategories(item.categories);

      var product = {
        "@context": "https://schema.org",
        "@type": "Product",
        "@id": location.origin + location.pathname + "#product",
        "name": item.name,
        "sku": item.sku,
        "description": text((item.description || item.short_description || {}).html) || item.meta_description,
        "image": images.length ? images : undefined,
        "offers": offers
      };

      if (brand) {
        product.brand = {
          "@type": "Brand",
          "name": brand
        };
      }

      if (item.ean_code) {
        product.gtin13 = clean(item.ean_code);
      }

      if (category && category.name) {
        product.category = clean(category.name);
      }

      var properties = [];

      if (item.product_unit_price) {
        properties.push({
          "@type": "PropertyValue",
          "name": "Unit price",
          "value": clean(item.product_unit_price)
        });
      }

      if (item.product_contents) {
        properties.push({
          "@type": "PropertyValue",
          "name": "Ingredients",
          "value": clean(item.product_contents)
        });
      }

      if (item.application) {
        properties.push({
          "@type": "PropertyValue",
          "name": "Application",
          "value": text(item.application)
        });
      }

      if (properties.length) {
        product.additionalProperty = properties;
      }

      var ratingValue = ratingFromPercent(item.rating_summary);

      if (item.review_count && ratingValue) {
        product.aggregateRating = {
          "@type": "AggregateRating",
          "ratingValue": ratingValue,
          "reviewCount": String(item.review_count),
          "bestRating": "5",
          "worstRating": "1"
        };
      }

      if (item.reviews && item.reviews.items && item.reviews.items.length) {
        product.review = item.reviews.items.map(function (review) {
          return {
            "@type": "Review",
            "author": {
              "@type": "Person",
              "name": review.nickname || "Customer"
            },
            "datePublished": review.created_at ? review.created_at.split(" ")[0] : undefined,
            "name": review.summary || undefined,
            "reviewBody": review.text || review.summary || undefined,
            "reviewRating": {
              "@type": "Rating",
              "ratingValue": ratingFromPercent(review.average_rating),
              "bestRating": "5",
              "worstRating": "1"
            }
          };
        });
      }

      addScript(productId, product, path);

      var breadcrumbs = breadcrumbSchema(category, item.name);
      if (breadcrumbs) {
        addScript(breadcrumbId, breadcrumbs, path);
      }
    })
    .catch(function (error) {
      window.__loverteProductSchemaPath = null;
      console.error("Loverte Product JSON-LD failed", error);
    });
})();
