// Food database names join their parts with underscores ("샐러드_시저치킨 샐러드"). Show spaces instead;
// the part before an underscore can be a real ingredient ("톳나물_두부"), so nothing is dropped.
export const plainFoodName = (name: string) => name.replace(/_+/g, ' ');
