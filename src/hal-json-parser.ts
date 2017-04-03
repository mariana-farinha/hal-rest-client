import { createResource } from "./hal-factory";
import { HalResource } from "./hal-resource";
import { IHalResource, IHalResourceConstructor } from "./hal-resource-interface";
import { HalRestClient } from "./hal-rest-client";

export class JSONParser {

  constructor(private halRestClient: HalRestClient) {}

  /**
   * convert a json to an halResource
   */
  public jsonToResource<T extends IHalResource>(
    json: any,
    c: IHalResourceConstructor<T>,
    resource?: T,
  ): T {
    if (!("_links" in json)) {
        throw new Error("object is not hal resource");
    }

    if (!resource) {
      const uri = "string" === typeof json._links.self ? json._links.self : json._links.self.href;
      resource = createResource(this.halRestClient, c, uri);
    }

    // get transflation between hal-service-name and name on ts class
    const halToTs = Reflect.getMetadata("halClient:halToTs", c.prototype) || {};

    for (const key in json) {
      if ("_links" === key) {
        const links = json._links;
        resource.links =  Object.keys(links)
                            .filter((item) => item !== "self")
                            .reduce((prev, currentKey) => {
                              if ("string" === typeof links[currentKey]) {
                                links[currentKey] = {href : links[currentKey]};
                              }
                              const type =  Reflect.getMetadata("halClient:specificType", c.prototype, currentKey)
                                            || HalResource;
                              const propKey = halToTs[currentKey] || currentKey;
                              prev[propKey] = createResource(this.halRestClient, type, links[currentKey].href);
                              return prev;
                            }, {});

        resource.uri = "string" === typeof links.self ? links.self : links.self.href;
      } else if ("_embedded" === key) {
        const embedded = json._embedded;
        for (const prop of Object.keys(embedded)) {
          const propKey = halToTs[prop] || prop;
          resource.prop(propKey, this.parseJson(embedded[prop], c, propKey));
        }
      } else {
        const propKey = halToTs[key] || key;
        resource.prop(propKey, this.parseJson(json[key], c, propKey));
      }
    }

    resource.isLoaded = true;
    return resource;
  }

  /**
   * parse a json to object
   */
  private parseJson(json, clazz ?: {prototype: any}, key ?: string): any {
    // if there are _links prop object is a resource
    if (null === json) {
      return null;
    } else if (Array.isArray(json)) {
      const type = Reflect.getMetadata("halClient:specificType", clazz.prototype, key) || HalResource;
      return json.map((item) => this.jsonToResource(item, type));
    } else if (typeof json === "object" && json._links !== undefined) {
      const type = Reflect.getMetadata("halClient:specificType", clazz.prototype, key) || HalResource;
      return this.jsonToResource(json, type);
    } else {
      return json;
    }
  }
}