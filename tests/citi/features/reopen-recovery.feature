@citi @browser @recovery
Feature: Saved Citi offers are usable when reopening the page
  A previous error must not permanently disable the action.
  Changed card request identifiers must not erase saved results.

  Background:
    Given a synthetic Citi page with the published userscript

  Scenario: One click after reopening reconciles changed card identifiers
    Given I loaded saved offers with masked card names
    And Citi changes the card request identifiers
    When I reload the page
    Then the "Add saved offers" button is enabled
    And no new Citi requests have been sent
    When I click "Add saved offers"
    And the operation reports "Finished: 2/2"
    Then the enrollment requests are exactly
      | card      | offer |
      | renewed-a | a     |
      | renewed-a | b     |
    And no enrollment request was repeated

  Scenario: A prior login error can recover with one saved-offers click after reopening
    Given I loaded offers and selected only card A
    And Citi temporarily rejects the login
    When I click "Add saved offers"
    And the operation reports "HTTP 401"
    And I reload the page
    Then the "Add saved offers" button is enabled
    And the saved-offers button shows 2 available offers
    And no new Citi requests have been sent
    Given Citi accepts the login again
    When I click "Add saved offers"
    And the operation reports "Finished: 2/2"
    Then the enrollment requests are exactly
      | card   | offer |
      | card-a | a     |
      | card-a | b     |

  Scenario: An unmatched login preserves the cache and full refresh recovers in one click
    Given I loaded offers and selected only card A
    And Citi now returns only card C for the current login
    When I click "Add saved offers"
    And the operation reports "saved offers were kept"
    Then the saved-offers button shows 2 available offers
    And no enrollment requests have been sent
    When I click "Refresh & add offers"
    And the operation reports "Finished: 2/2"
    Then the enrollment requests are exactly
      | card   | offer |
      | card-c | a     |
      | card-c | b     |
