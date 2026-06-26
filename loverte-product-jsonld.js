(function () {
  var id = "loverte-product-jsonld";
  var path = location.pathname;
  var existing = document.getElementById(id);
  var match = path.match(/^\/(et|lv|lt|fi|en|ru)\/([^/?#]+)\/?$/);

  if (!match) {
    if (existing) existing.remove();
    window.__loverteProductSchemaPath = null;
    return;
  }

  if (existing && existing.getAttribute("data-path") === path) return;
  if (window.__loverteProductSchemaPath === path) return;

  window.__loverteProductSchemaPath = path;
  if (existing) existing.remove();

  var lang = match[1];
  var urlKey = decodeURIComponent(match[2]);

  var query = 'query ProductSchema($key:String!){products(filter:{url_key:{eq:$key}}){items{sku name meta_description description{html} short_description{html} image{url label} review_count rating_summary reviews(pageSize:5){items{nickname summary text average_rating created_at}} price_range{minimum_price{final_price{value currency} regular_price{value currency}}} stock_status ... on ConfigurableProduct{variants{product{sku name stock_status price_range{minimum_price{final_price{value currency} regular_price{value currency}}}}}}}}}';

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

      var product = {
        "@context": "https://schema.org",
        "@type": "Product",
        "@id": location.origin + location.pathname + "#product",
        "name": item.name,
        "sku": item.sku,
        "description": text((item.description || item.short_description || {}).html) || item.meta_description,
        "image": item.image && item.image.url,
        "offers": offers
      };

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

      var script = document.createElement("script");
      script.type = "application/ld+json";
      script.id = id;
      script.setAttribute("data-path", path);
      script.text = JSON.stringify(product);
      document.head.appendChild(script);
    })
    .catch(function (error) {
      window.__loverteProductSchemaPath = null;
      console.error("Loverte Product JSON-LD failed", error);
    });
})();
