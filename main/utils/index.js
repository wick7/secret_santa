// Utility to group members by a key (e.g., groupId)
export const groupBy = (array, key) => {
    return array.reduce((result, current) => {
      (result[current[key]] = result[current[key]] || []).push(current);
      return result;
    }, {});
  }
  
  // Utility to shuffle an array (Fisher-Yates shuffle)
export const shuffleArray = () => {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

export const generate_members = () => {
    const people = [];
  
    // Generate an array of 10 random people
    for (let i = 0; i < 10; i++) {
      const person = {
        _id: uuidv4(), // Generate random GUID for _id
        groupId: uuidv4(), // Generate random GUID for groupId
        firstName: faker.name.firstName(), // Random first name
        lastName: faker.name.lastName() // Random last name
      };
      people.push(person);
    }
    console.log(people);
  }